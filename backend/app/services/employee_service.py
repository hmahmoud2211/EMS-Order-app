import csv
import io
import uuid

from pydantic import ValidationError
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.core.errors import BusinessRuleError, ConflictError, NotFoundError
from app.core.security import generate_temporary_password, hash_password, validate_password_strength
from app.models import Order, User
from app.models.enums import UserRole
from app.repositories import users as users_repo
from app.schemas.employee import (
    EmployeeCreate,
    EmployeeImportCredential,
    EmployeeImportResult,
    EmployeeImportRow,
    EmployeeUpdate,
)
from app.services import audit_service, auth_service
from app.utils.serialization import model_snapshot
from app.utils.text import username_from_name

AUDIT_FIELDS = [
    "full_name",
    "username",
    "email",
    "phone",
    "department",
    "role",
    "is_active",
    "participates_in_orders",
]

CSV_HEADER_ALIASES = {
    "full_name": {"full_name", "full name", "name", "employee", "employee name", "الاسم"},
    "username": {"username", "user name", "login", "user", "اسم المستخدم"},
    "email": {"email", "e-mail", "mail", "البريد", "البريد الإلكتروني"},
    "phone": {"phone", "mobile", "phone number", "الهاتف", "الموبايل"},
    "department": {"department", "dept", "team", "القسم", "الإدارة"},
    "role": {"role", "الدور"},
}

MAX_IMPORT_ROWS = 500


def get_employee(db: Session, employee_id: uuid.UUID) -> User:
    user = db.get(User, employee_id)
    if user is None:
        raise NotFoundError("Employee not found.", code="EMPLOYEE_NOT_FOUND")
    return user


def list_employees(
    db: Session, q: str | None, status: str, role: str | None, limit: int, offset: int
) -> tuple[list[User], int]:
    stmt = select(User)
    if status == "active":
        stmt = stmt.where(User.is_active.is_(True))
    elif status == "inactive":
        stmt = stmt.where(User.is_active.is_(False))
    if role:
        stmt = stmt.where(User.role == role)
    if q:
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(User.full_name).like(like),
                User.username.like(like),
                func.lower(func.coalesce(User.email, "")).like(like),
                func.lower(func.coalesce(User.department, "")).like(like),
            )
        )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = list(db.scalars(stmt.order_by(User.full_name).limit(limit).offset(offset)))
    return items, total


def _ensure_unique(
    db: Session, username: str | None, email: str | None, exclude_id: uuid.UUID | None
) -> None:
    if username:
        clash = db.scalar(select(User.id).where(User.username == username))
        if clash and clash != exclude_id:
            raise ConflictError("This username is already taken.", code="USERNAME_TAKEN")
    if email:
        clash = db.scalar(select(User.id).where(func.lower(User.email) == email.lower()))
        if clash and clash != exclude_id:
            raise ConflictError("This email is already used by another account.", code="EMAIL_TAKEN")


def create_employee(db: Session, actor: User, data: EmployeeCreate) -> tuple[User, str | None]:
    _ensure_unique(db, data.username, data.email, None)
    temporary = None
    if data.password:
        problem = validate_password_strength(data.password)
        if problem:
            raise BusinessRuleError(problem, code="WEAK_PASSWORD")
        password = data.password
    else:
        temporary = password = generate_temporary_password()
    participates = data.participates_in_orders
    if participates is None:
        participates = data.role == UserRole.EMPLOYEE
    user = User(
        full_name=data.full_name,
        username=data.username,
        email=data.email,
        phone=data.phone,
        department=data.department,
        role=data.role,
        password_hash=hash_password(password),
        participates_in_orders=participates,
        must_change_password=True,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("This username or email is already in use.", code="EMPLOYEE_EXISTS") from exc
    audit_service.record(
        db,
        actor_id=actor.id,
        entity_type="user",
        entity_id=user.id,
        action="EMPLOYEE_CREATED",
        new=model_snapshot(user, AUDIT_FIELDS),
    )
    db.commit()
    return user, temporary


def _active_admin_count(db: Session) -> int:
    return users_repo.active_admin_count(db)


def update_employee(db: Session, actor: User, employee_id: uuid.UUID, data: EmployeeUpdate) -> User:
    user = get_employee(db, employee_id)
    changes = data.model_dump(exclude_unset=True)
    if "full_name" in changes and changes["full_name"] is None:
        raise BusinessRuleError("Full name is required.", code="VALIDATION_ERROR")
    if "username" in changes and changes["username"] is None:
        raise BusinessRuleError("Username is required.", code="VALIDATION_ERROR")
    _ensure_unique(db, changes.get("username"), changes.get("email"), user.id)
    if (
        changes.get("role") == UserRole.EMPLOYEE
        and user.role == UserRole.ADMIN
        and user.is_active
        and _active_admin_count(db) <= 1
    ):
        raise BusinessRuleError("At least one active administrator is required.", code="LAST_ADMIN")
    previous = model_snapshot(user, AUDIT_FIELDS)
    for field, value in changes.items():
        setattr(user, field, value.value if hasattr(value, "value") else value)
    if "full_name" in changes:
        user.full_name = " ".join(user.full_name.split())
    audit_service.record(
        db,
        actor_id=actor.id,
        entity_type="user",
        entity_id=user.id,
        action="EMPLOYEE_UPDATED",
        previous=previous,
        new=model_snapshot(user, AUDIT_FIELDS),
    )
    db.commit()
    db.refresh(user)
    return user


def set_active(db: Session, actor: User, employee_id: uuid.UUID, active: bool, clock: Clock) -> User:
    user = get_employee(db, employee_id)
    if not active:
        if user.id == actor.id:
            raise BusinessRuleError("You cannot deactivate your own account.", code="CANNOT_DEACTIVATE_SELF")
        if user.role == UserRole.ADMIN and user.is_active and _active_admin_count(db) <= 1:
            raise BusinessRuleError("At least one active administrator is required.", code="LAST_ADMIN")
    if user.is_active == active:
        return user
    user.is_active = active
    if not active:
        auth_service.revoke_all_tokens(db, user.id, clock.now())
    audit_service.record(
        db,
        actor_id=actor.id,
        entity_type="user",
        entity_id=user.id,
        action="EMPLOYEE_REACTIVATED" if active else "EMPLOYEE_DEACTIVATED",
        previous={"is_active": not active},
        new={"is_active": active},
    )
    db.commit()
    return user


def admin_reset_password(db: Session, actor: User, employee_id: uuid.UUID, method: str, clock: Clock):
    user = get_employee(db, employee_id)
    if not user.is_active:
        raise BusinessRuleError(
            "Reactivate the account before resetting its password.", code="ACCOUNT_DISABLED"
        )
    expires_at = None
    if method == "temporary_password":
        secret = generate_temporary_password()
        user.password_hash = hash_password(secret)
        user.must_change_password = True
        user.failed_login_attempts = 0
        user.locked_until = None
        auth_service.revoke_all_tokens(db, user.id, clock.now())
    else:
        secret, expires_at = auth_service.create_reset_code(db, user, clock, created_by=actor.id)
    audit_service.record(
        db,
        actor_id=actor.id,
        entity_type="user",
        entity_id=user.id,
        action="PASSWORD_RESET_ISSUED",
        new={"method": method},
    )
    db.commit()
    return method, secret, expires_at


# ---- CSV import -------------------------------------------------------------


def _decode(raw: bytes) -> str:
    for encoding in ("utf-8-sig", "cp1256", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise BusinessRuleError("The CSV file encoding is not supported. Save it as UTF-8.", code="INVALID_CSV")


def _map_headers(headers: list[str]) -> dict[str, int]:
    mapping: dict[str, int] = {}
    for idx, header in enumerate(headers):
        key = header.strip().lower().replace("_", " ")
        for field, aliases in CSV_HEADER_ALIASES.items():
            if field not in mapping and (key in aliases or key.replace(" ", "_") == field):
                mapping[field] = idx
    return mapping


def import_employees_csv(db: Session, actor: User, raw: bytes, dry_run: bool) -> EmployeeImportResult:
    text = _decode(raw)
    try:
        dialect = csv.Sniffer().sniff(text[:2048], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.reader(io.StringIO(text), dialect)
    rows = [r for r in reader if any(cell.strip() for cell in r)]
    if not rows:
        raise BusinessRuleError("The CSV file is empty.", code="INVALID_CSV")
    mapping = _map_headers(rows[0])
    if "full_name" not in mapping:
        raise BusinessRuleError(
            "The CSV must have a 'full_name' (or 'name') column.",
            code="INVALID_CSV",
            details={"headers": rows[0]},
        )
    data_rows = rows[1:]
    if len(data_rows) > MAX_IMPORT_ROWS:
        raise BusinessRuleError(f"Import at most {MAX_IMPORT_ROWS} rows at a time.", code="INVALID_CSV")

    existing_usernames = set(db.scalars(select(User.username)))
    existing_emails = {e.lower() for e in db.scalars(select(User.email).where(User.email.is_not(None)))}
    seen_usernames: set[str] = set()
    seen_emails: set[str] = set()

    def cell(row: list[str], field: str) -> str | None:
        idx = mapping.get(field)
        if idx is None or idx >= len(row):
            return None
        return row[idx].strip() or None

    report: list[EmployeeImportRow] = []
    valid: list[EmployeeCreate] = []
    for number, row in enumerate(data_rows, start=2):
        full_name = cell(row, "full_name")
        username = cell(row, "username")
        if not username and full_name:
            base = username_from_name(full_name)
            username, n = base, 2
            while username in existing_usernames or username in seen_usernames:
                username, n = f"{base}{n}", n + 1
        errors: list[str] = []
        payload = {
            "full_name": full_name or "",
            "username": username or "",
            "email": cell(row, "email"),
            "phone": cell(row, "phone"),
            "department": cell(row, "department"),
            "role": (cell(row, "role") or "EMPLOYEE").upper(),
        }
        parsed: EmployeeCreate | None = None
        try:
            parsed = EmployeeCreate(**payload)
        except ValidationError as exc:
            errors.extend(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors())
        if parsed:
            if parsed.username in existing_usernames:
                errors.append("username: already exists")
            if parsed.username in seen_usernames:
                errors.append("username: duplicated in file")
            if parsed.email and parsed.email in existing_emails:
                errors.append("email: already exists")
            if parsed.email and parsed.email in seen_emails:
                errors.append("email: duplicated in file")
            seen_usernames.add(parsed.username)
            if parsed.email:
                seen_emails.add(parsed.email)
        report.append(
            EmployeeImportRow(
                row=number,
                full_name=full_name,
                username=username,
                email=payload["email"],
                phone=payload["phone"],
                department=payload["department"],
                errors=errors,
            )
        )
        if parsed and not errors:
            valid.append(parsed)

    created: list[EmployeeImportCredential] = []
    if not dry_run and valid:
        for item in valid:
            temp = generate_temporary_password()
            user = User(
                full_name=item.full_name,
                username=item.username,
                email=item.email,
                phone=item.phone,
                department=item.department,
                role=item.role,
                password_hash=hash_password(temp),
                participates_in_orders=item.role == UserRole.EMPLOYEE,
                must_change_password=True,
            )
            db.add(user)
            created.append(
                EmployeeImportCredential(
                    full_name=user.full_name, username=user.username, temporary_password=temp
                )
            )
        db.flush()
        audit_service.record(
            db,
            actor_id=actor.id,
            entity_type="user",
            entity_id="bulk",
            action="EMPLOYEES_IMPORTED",
            new={"count": len(created), "usernames": [c.username for c in created]},
        )
        db.commit()

    return EmployeeImportResult(
        dry_run=dry_run,
        total_rows=len(data_rows),
        valid_rows=len(valid),
        rows=report,
        created=created,
    )


def employee_orders(db: Session, employee_id: uuid.UUID, limit: int, offset: int):
    get_employee(db, employee_id)
    stmt = select(Order).where(Order.employee_id == employee_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = list(db.scalars(stmt.order_by(Order.submitted_at.desc()).limit(limit).offset(offset)))
    return items, total
