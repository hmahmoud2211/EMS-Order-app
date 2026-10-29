import smtplib
import uuid
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage

import structlog
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.core.config import get_settings
from app.core.errors import BusinessRuleError, ForbiddenError, UnauthorizedError
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    generate_reset_code,
    hash_password,
    hash_token,
    password_needs_rehash,
    tokens_equal,
    validate_password_strength,
    verify_password,
)
from app.models import PasswordResetCode, RefreshToken, User
from app.models.enums import NotificationType
from app.repositories import users as users_repo
from app.schemas.auth import CurrentUser, LoginResponse, TokenPair
from app.services import audit_service, notification_service

log = structlog.get_logger(__name__)

# A real hash of a random string, so unknown usernames cost the same time as wrong passwords.
_DUMMY_HASH = hash_password(uuid.uuid4().hex)

MAX_RESET_ATTEMPTS = 5


def find_user_by_identifier(db: Session, identifier: str) -> User | None:
    return users_repo.find_by_identifier(db, identifier)


def _issue_tokens(
    db: Session, user: User, now: datetime, family_id: uuid.UUID | None = None, user_agent: str | None = None
) -> tuple[TokenPair, RefreshToken]:
    settings = get_settings()
    # JWT timestamps always use real time (PyJWT validates iat/exp against the system clock);
    # the injectable business clock only governs business rules.
    access_token, access_expires = create_access_token(user.id, user.role, datetime.now(UTC))
    raw_refresh = generate_refresh_token()
    refresh = RefreshToken(
        user_id=user.id,
        token_hash=hash_token(raw_refresh),
        family_id=family_id or uuid.uuid4(),
        expires_at=now + timedelta(days=settings.refresh_token_days),
        user_agent=(user_agent or "")[:255] or None,
    )
    db.add(refresh)
    db.flush()
    pair = TokenPair(
        access_token=access_token, refresh_token=raw_refresh, access_token_expires_at=access_expires
    )
    return pair, refresh


def login(db: Session, identifier: str, password: str, clock: Clock, user_agent: str | None) -> LoginResponse:
    settings = get_settings()
    now = clock.now()
    user = find_user_by_identifier(db, identifier)
    invalid = UnauthorizedError("Incorrect username or password.", code="INVALID_CREDENTIALS")

    if user is None:
        verify_password(_DUMMY_HASH, password)
        raise invalid
    if user.locked_until and user.locked_until > now:
        minutes = max(1, int((user.locked_until - now).total_seconds() // 60) + 1)
        raise UnauthorizedError(
            f"Too many failed attempts. Try again in {minutes} minute(s).",
            code="ACCOUNT_LOCKED",
            details={"locked_until": user.locked_until.isoformat()},
        )
    if not verify_password(user.password_hash, password):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= settings.login_max_failed_attempts:
            user.locked_until = now + timedelta(minutes=settings.login_lockout_minutes)
            user.failed_login_attempts = 0
        db.commit()
        raise invalid
    if not user.is_active:
        raise UnauthorizedError(
            "This account has been deactivated. Please contact your administrator.",
            code="ACCOUNT_DISABLED",
        )

    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now
    pair, _ = _issue_tokens(db, user, now, user_agent=user_agent)
    db.commit()
    log.info("login_success", user_id=str(user.id))
    return LoginResponse(**pair.model_dump(), user=CurrentUser.model_validate(user))


def refresh(db: Session, raw_token: str, clock: Clock, user_agent: str | None) -> TokenPair:
    now = clock.now()
    token = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_token)).with_for_update()
    )
    if token is None:
        raise UnauthorizedError(
            "Your session has expired. Please sign in again.", code="INVALID_REFRESH_TOKEN"
        )
    if token.revoked_at is not None:
        # Reuse of a rotated token: assume theft and revoke the whole family.
        db.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == token.family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        db.commit()
        log.warning("refresh_token_reuse_detected", user_id=str(token.user_id))
        raise UnauthorizedError("Your session is no longer valid. Please sign in again.", code="TOKEN_REUSED")
    if token.expires_at <= now:
        raise UnauthorizedError(
            "Your session has expired. Please sign in again.", code="INVALID_REFRESH_TOKEN"
        )
    user = db.get(User, token.user_id)
    if user is None or not user.is_active:
        raise UnauthorizedError(
            "This account has been deactivated. Please contact your administrator.",
            code="ACCOUNT_DISABLED",
        )
    pair, new_token = _issue_tokens(db, user, now, family_id=token.family_id, user_agent=user_agent)
    token.revoked_at = now
    token.replaced_by_id = new_token.id
    db.commit()
    return pair


def logout(db: Session, user: User, raw_token: str | None, clock: Clock) -> None:
    now = clock.now()
    if raw_token:
        token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_token)))
        if token is not None and token.user_id == user.id:
            db.execute(
                update(RefreshToken)
                .where(RefreshToken.family_id == token.family_id, RefreshToken.revoked_at.is_(None))
                .values(revoked_at=now)
            )
    db.commit()


def revoke_all_tokens(db: Session, user_id: uuid.UUID, now: datetime) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )


def _set_password(user: User, new_password: str) -> None:
    problem = validate_password_strength(new_password)
    if problem:
        raise BusinessRuleError(problem, code="WEAK_PASSWORD")
    user.password_hash = hash_password(new_password)


def change_password(
    db: Session, user: User, current_password: str, new_password: str, clock: Clock, user_agent: str | None
) -> TokenPair:
    if not verify_password(user.password_hash, current_password):
        raise BusinessRuleError("Your current password is incorrect.", code="INVALID_CURRENT_PASSWORD")
    if current_password == new_password:
        raise BusinessRuleError(
            "Choose a password different from the current one.", code="PASSWORD_UNCHANGED"
        )
    _set_password(user, new_password)
    user.must_change_password = False
    now = clock.now()
    revoke_all_tokens(db, user.id, now)
    pair, _ = _issue_tokens(db, user, now, user_agent=user_agent)
    audit_service.record(
        db, actor_id=user.id, entity_type="user", entity_id=user.id, action="PASSWORD_CHANGED"
    )
    db.commit()
    return pair


def create_reset_code(
    db: Session, user: User, clock: Clock, created_by: uuid.UUID | None
) -> tuple[str, datetime]:
    settings = get_settings()
    now = clock.now()
    # Invalidate earlier unused codes.
    db.execute(
        update(PasswordResetCode)
        .where(PasswordResetCode.user_id == user.id, PasswordResetCode.used_at.is_(None))
        .values(used_at=now)
    )
    code = generate_reset_code()
    expires_at = now + timedelta(minutes=settings.password_reset_code_minutes)
    db.add(
        PasswordResetCode(
            user_id=user.id, code_hash=hash_token(code), expires_at=expires_at, created_by_id=created_by
        )
    )
    return code, expires_at


def request_password_reset(db: Session, identifier: str, clock: Clock) -> None:
    """Always succeeds from the caller's perspective (no account enumeration)."""
    user = find_user_by_identifier(db, identifier)
    if user is None or not user.is_active:
        return
    now = clock.now()
    if get_settings().smtp_configured and user.email:
        code, expires_at = create_reset_code(db, user, clock, created_by=None)
        db.commit()
        _email_reset_code(user, code, expires_at)
        return
    # No email service: ask administrators to issue a reset code in person.
    window = now.strftime("%Y%m%d%H")
    notification_service.notify(
        db,
        notification_service.admin_ids(db),
        type=NotificationType.PASSWORD_RESET_REQUESTED,
        title="Password reset requested",
        message=f"{user.full_name} ({user.username}) asked for a password reset. "
        "Open their profile to issue a reset code.",
        data={"employee_id": str(user.id)},
        dedupe_prefix=f"pwreset:{user.id}:{window}",
    )
    db.commit()


def _email_reset_code(user: User, code: str, expires_at: datetime) -> None:
    settings = get_settings()
    msg = EmailMessage()
    msg["Subject"] = "EMS Food password reset code"
    msg["From"] = settings.smtp_from
    msg["To"] = user.email
    msg.set_content(
        f"Hello {user.full_name},\n\nYour EMS Food password reset code is: {code}\n"
        f"It expires at {expires_at.astimezone(settings.tz):%H:%M} (Cairo time).\n\n"
        "If you did not request this, you can ignore this email."
    )
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password or "")
            smtp.send_message(msg)
    except Exception as exc:
        log.error("reset_email_failed", error=str(exc), user_id=str(user.id))


def reset_password(db: Session, identifier: str, code: str, new_password: str, clock: Clock) -> None:
    now = clock.now()
    invalid = BusinessRuleError("The reset code is invalid or has expired.", code="INVALID_RESET_CODE")
    user = find_user_by_identifier(db, identifier)
    if user is None or not user.is_active:
        raise invalid
    record = db.scalar(
        select(PasswordResetCode)
        .where(
            PasswordResetCode.user_id == user.id,
            PasswordResetCode.used_at.is_(None),
            PasswordResetCode.expires_at > now,
        )
        .order_by(PasswordResetCode.created_at.desc())
        .with_for_update()
    )
    if record is None or record.attempts >= MAX_RESET_ATTEMPTS:
        raise invalid
    if not tokens_equal(record.code_hash, hash_token(code.strip().upper())):
        record.attempts += 1
        db.commit()
        raise invalid
    _set_password(user, new_password)
    user.must_change_password = False
    user.failed_login_attempts = 0
    user.locked_until = None
    record.used_at = now
    revoke_all_tokens(db, user.id, now)
    audit_service.record(
        db, actor_id=user.id, entity_type="user", entity_id=user.id, action="PASSWORD_RESET_WITH_CODE"
    )
    db.commit()


def ensure_active(user: User) -> None:
    if not user.is_active:
        raise ForbiddenError("This account has been deactivated.", code="ACCOUNT_DISABLED")
