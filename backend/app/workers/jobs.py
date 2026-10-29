"""Scheduled jobs. Each job is idempotent and safe to run every minute."""

from datetime import timedelta

import structlog
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.models import DailySession, IdempotencyKey, Order
from app.models.enums import NotificationType, OrderStatus, SessionStatus
from app.services import notification_service, push_service, session_service, settings_service

log = structlog.get_logger(__name__)


def auto_close_sessions(db: Session, clock: Clock) -> int:
    """Close OPEN sessions whose deadline has passed."""
    now = clock.now()
    ids = list(
        db.scalars(
            select(DailySession.id).where(
                DailySession.status == SessionStatus.OPEN, DailySession.closes_at <= now
            )
        )
    )
    closed = 0
    for session_id in ids:
        session = session_service.get_session(db, session_id, lock=True)
        if session.status == SessionStatus.OPEN and session.closes_at <= now:
            session_service.close_locked(db, None, session, clock)
            db.commit()
            closed += 1
            log.info("session_auto_closed", session_id=str(session_id))
    return closed


def notify_ordering_opened(db: Session, clock: Clock) -> int:
    """Send 'ordering opened' when a scheduled session reaches its opening time."""
    now = clock.now()
    sessions = list(
        db.scalars(
            select(DailySession).where(
                DailySession.status == SessionStatus.OPEN,
                DailySession.session_date == clock.today(),
                DailySession.opens_at <= now,
                DailySession.closes_at > now,
                DailySession.open_notified_at.is_(None),
            )
        )
    )
    for session in sessions:
        session_service.notify_opened(db, session, clock)
        db.commit()
    return len(sessions)


def deadline_reminders(db: Session, clock: Clock) -> int:
    """Remind participants without an order when the deadline is near (once per deadline)."""
    now = clock.now()
    minutes = settings_service.get_app_settings(db).reminder_minutes_before_deadline
    sessions = list(
        db.scalars(
            select(DailySession).where(
                DailySession.status == SessionStatus.OPEN,
                DailySession.opens_at <= now,
                DailySession.closes_at > now,
                DailySession.closes_at <= now + timedelta(minutes=minutes),
            )
        )
    )
    sent = 0
    for session in sessions:
        ordered = set(
            db.scalars(
                select(Order.employee_id).where(
                    Order.session_id == session.id, Order.status == OrderStatus.SUBMITTED
                )
            )
        )
        targets = [uid for uid in notification_service.participant_ids(db) if uid not in ordered]
        remaining = max(1, int((session.closes_at - now).total_seconds() // 60))
        created = notification_service.notify(
            db,
            targets,
            type=NotificationType.DEADLINE_APPROACHING,
            title=f"Only {remaining} minutes left to order!",
            message=f"Order from {session.restaurant.name} before "
            f"{session_service.format_local_time(session.closes_at)}.",
            data={"session_id": str(session.id)},
            dedupe_prefix=f"session:{session.id}:reminder:{int(session.closes_at.timestamp())}",
        )
        db.commit()
        sent += len(created)
    return sent


def cleanup(db: Session, clock: Clock) -> None:
    db.execute(delete(IdempotencyKey).where(IdempotencyKey.created_at < clock.now() - timedelta(days=3)))
    db.commit()


def check_push_receipts(db: Session, _: Clock) -> int:
    return push_service.check_receipts(db)
