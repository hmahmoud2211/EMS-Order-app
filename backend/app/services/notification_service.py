"""In-app notifications with at-most-once semantics.

A notification row is inserted with ``ON CONFLICT (dedupe_key) DO NOTHING``; only
rows that were actually inserted are queued for push delivery. Delivery happens
after the surrounding transaction commits (see ``app.services.push_service``), so a
rolled-back business operation never produces a push and a push failure never
breaks a business operation.
"""

import uuid
from collections.abc import Iterable

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.models import Notification, PushToken, User
from app.models.enums import NotificationType
from app.repositories import users as users_repo

PENDING_PUSH_KEY = "pending_push_notification_ids"

PREF_FOR_TYPE: dict[str, str] = {
    NotificationType.RESTAURANT_SELECTED: "session_updates",
    NotificationType.ORDERING_OPENED: "session_updates",
    NotificationType.SESSION_CLOSED: "session_updates",
    NotificationType.SESSION_FINALIZED: "session_updates",
    NotificationType.SESSION_CANCELLED: "session_updates",
    NotificationType.DEADLINE_APPROACHING: "deadline_reminders",
    NotificationType.ORDER_SUBMITTED: "order_updates",
    NotificationType.ORDER_MODIFIED: "order_updates",
    NotificationType.ORDER_CANCELLED: "order_updates",
}


def notify(
    db: Session,
    user_ids: Iterable[uuid.UUID],
    *,
    type: NotificationType,
    title: str,
    message: str,
    data: dict | None = None,
    dedupe_prefix: str | None = None,
) -> list[uuid.UUID]:
    """Create notifications for users. Returns ids of newly created rows."""
    rows = []
    for user_id in dict.fromkeys(user_ids):
        rows.append(
            {
                "id": uuid.uuid4(),
                "user_id": user_id,
                "title": title,
                "message": message,
                "type": type.value,
                "data": data or {},
                "dedupe_key": f"{dedupe_prefix}:{user_id}" if dedupe_prefix else None,
            }
        )
    if not rows:
        return []
    stmt = insert(Notification).values(rows).on_conflict_do_nothing(index_elements=["dedupe_key"])
    created = list(db.scalars(stmt.returning(Notification.id)))
    db.info.setdefault(PENDING_PUSH_KEY, []).extend(created)
    return created


def participant_ids(db: Session) -> list[uuid.UUID]:
    return users_repo.active_participant_ids(db)


def admin_ids(db: Session) -> list[uuid.UUID]:
    return users_repo.active_admin_ids(db)


def list_for_user(db: Session, user: User, limit: int, offset: int, unread_only: bool = False):
    base = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        base = base.where(Notification.is_read.is_(False))
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    unread = (
        db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user.id, Notification.is_read.is_(False))
        )
        or 0
    )
    items = list(db.scalars(base.order_by(Notification.created_at.desc()).limit(limit).offset(offset)))
    return items, total, unread


def mark_read(db: Session, user: User, notification_id: uuid.UUID) -> Notification:
    notification = db.get(Notification, notification_id)
    if notification is None or notification.user_id != user.id:
        raise NotFoundError("Notification not found.", code="NOTIFICATION_NOT_FOUND")
    notification.is_read = True
    db.commit()
    return notification


def mark_all_read(db: Session, user: User) -> int:
    result = db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    db.commit()
    return result.rowcount or 0


def register_device(db: Session, user: User, token: str, platform: str, device_name: str | None) -> None:
    stmt = (
        insert(PushToken)
        .values(
            id=uuid.uuid4(),
            user_id=user.id,
            token=token,
            platform=platform,
            device_name=device_name,
            is_active=True,
        )
        .on_conflict_do_update(
            index_elements=["token"],
            # A device that changes hands is re-bound to the user who registered last.
            set_={
                "user_id": user.id,
                "platform": platform,
                "device_name": device_name,
                "is_active": True,
                "last_seen_at": func.now(),
            },
        )
    )
    db.execute(stmt)
    db.commit()


def unregister_device(db: Session, user: User, token: str) -> None:
    db.execute(
        update(PushToken)
        .where(PushToken.token == token, PushToken.user_id == user.id)
        .values(is_active=False)
    )
    db.commit()
