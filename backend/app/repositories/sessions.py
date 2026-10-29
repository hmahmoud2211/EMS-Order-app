"""Daily session queries."""

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DailySession
from app.models.enums import SessionStatus


def get(db: Session, session_id: uuid.UUID, *, lock: bool = False) -> DailySession | None:
    """Fetch a session; with ``lock`` the row is locked (SELECT … FOR UPDATE) for the transaction."""
    stmt = select(DailySession).where(DailySession.id == session_id)
    if lock:
        stmt = stmt.with_for_update(of=DailySession)
    return db.scalar(stmt)


def for_date(db: Session, day: date) -> DailySession | None:
    """The active (non-cancelled) session of a business date — at most one exists."""
    return db.scalar(
        select(DailySession).where(
            DailySession.session_date == day, DailySession.status != SessionStatus.CANCELLED
        )
    )
