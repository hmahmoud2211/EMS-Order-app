"""User queries shared by the auth, employee, notification and report services."""

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import User
from app.models.enums import UserRole


def get(db: Session, user_id: uuid.UUID) -> User | None:
    return db.get(User, user_id)


def find_by_identifier(db: Session, identifier: str) -> User | None:
    """Look up a user by username or email (case-insensitive)."""
    ident = identifier.strip().lower()
    return db.scalar(select(User).where(or_(User.username == ident, func.lower(User.email) == ident)))


def active_participant_ids(db: Session) -> list[uuid.UUID]:
    """Active accounts that take part in daily lunch ordering."""
    return list(
        db.scalars(select(User.id).where(User.is_active.is_(True), User.participates_in_orders.is_(True)))
    )


def active_admin_ids(db: Session) -> list[uuid.UUID]:
    return list(db.scalars(select(User.id).where(User.is_active.is_(True), User.role == UserRole.ADMIN)))


def active_admin_count(db: Session) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(User)
            .where(User.role == UserRole.ADMIN, User.is_active.is_(True))
        )
        or 0
    )
