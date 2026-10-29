"""Daily ordering sessions: the central business rule of EMS Food.

One company date has at most one active session (enforced by a partial unique
index), each session is bound to exactly one restaurant, and every state change
locks the session row so it serializes against concurrent order submissions.

State machine::

    DRAFT ──open──▶ OPEN ──close──▶ CLOSED ──finalize──▶ FINALIZED
      │              ▲ └──────reopen───┘ │
      └──────────────┴──── cancel ───────┴──▶ CANCELLED
"""

import uuid
from datetime import date, datetime, time

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.clock import Clock, business_datetime, to_business_tz
from app.core.errors import BusinessRuleError, ConflictError, NotFoundError
from app.models import DailySession, Order, OrderRevision, User
from app.models.enums import NotificationType, OrderStatus, RevisionAction, SessionStatus
from app.repositories import orders as orders_repo
from app.repositories import sessions as sessions_repo
from app.schemas.session import SessionCreate, SessionUpdate
from app.services import audit_service, notification_service, restaurant_service, settings_service
from app.utils.serialization import model_snapshot

SESSION_FIELDS = [
    "session_date",
    "restaurant_id",
    "opens_at",
    "closes_at",
    "status",
    "notes",
    "delivery_fee",
    "service_fee",
    "fee_note",
    "fee_allocation",
]


def get_session(db: Session, session_id: uuid.UUID, *, lock: bool = False) -> DailySession:
    session = sessions_repo.get(db, session_id, lock=lock)
    if session is None:
        raise NotFoundError("Ordering session not found.", code="SESSION_NOT_FOUND")
    return session


def session_for_date(db: Session, day: date) -> DailySession | None:
    return sessions_repo.for_date(db, day)


def format_local_time(value: datetime) -> str:
    return to_business_tz(value).strftime("%-I:%M %p")


def accepting_state(session: DailySession | None, clock: Clock) -> tuple[bool, str | None]:
    """Whether employees may submit/edit orders right now, and why not."""
    if session is None:
        return False, "NO_SESSION"
    now = clock.now()
    if session.session_date != clock.today():
        return False, "SESSION_NOT_TODAY"
    if session.status == SessionStatus.DRAFT:
        return False, "SESSION_NOT_OPEN"
    if session.status == SessionStatus.CLOSED:
        return False, "SESSION_CLOSED"
    if session.status == SessionStatus.FINALIZED:
        return False, "SESSION_FINALIZED"
    if session.status == SessionStatus.CANCELLED:
        return False, "SESSION_CANCELLED"
    if now < session.opens_at:
        return False, "ORDERING_NOT_STARTED"
    if now >= session.closes_at:
        return False, "DEADLINE_PASSED"
    return True, None


_ACCEPTING_MESSAGES = {
    "NO_SESSION": "No restaurant has been selected for today yet.",
    "SESSION_NOT_TODAY": "This ordering session is not for today.",
    "SESSION_NOT_OPEN": "Ordering has not been opened yet.",
    "SESSION_CLOSED": "Ordering for today is closed.",
    "SESSION_FINALIZED": "Today's order has been finalized.",
    "SESSION_CANCELLED": "Today's ordering session was cancelled.",
    "ORDERING_NOT_STARTED": "Ordering has not started yet.",
    "DEADLINE_PASSED": "The ordering deadline has passed.",
}


def ensure_accepting(session: DailySession, clock: Clock) -> None:
    ok, reason = accepting_state(session, clock)
    if not ok:
        status = 409 if reason in {"SESSION_CLOSED", "SESSION_FINALIZED", "SESSION_CANCELLED"} else 422
        message = _ACCEPTING_MESSAGES.get(reason or "", "Orders are not being accepted.")
        if reason == "ORDERING_NOT_STARTED":
            message = f"Ordering opens at {format_local_time(session.opens_at)}."
        raise BusinessRuleError(message, code=reason, status_code=status)


def active_orders(db: Session, session_id: uuid.UUID) -> list[Order]:
    return orders_repo.active_in_session(db, session_id)


def _ensure_restaurant_orderable(db: Session, restaurant_id: uuid.UUID):
    restaurant = restaurant_service.get_restaurant(db, restaurant_id)
    if not restaurant.is_active:
        raise BusinessRuleError("This restaurant is inactive.", code="RESTAURANT_INACTIVE")
    if restaurant_service.menu_item_count(db, restaurant.id, available_only=True) == 0:
        raise BusinessRuleError(
            "This restaurant has no available menu items. Add or import a menu first.",
            code="RESTAURANT_MENU_EMPTY",
        )
    return restaurant


def _parse_hhmm(value: str) -> time:
    hours, minutes = value.split(":")
    return time(int(hours), int(minutes))


def create_session(db: Session, actor: User, data: SessionCreate, clock: Clock) -> DailySession:
    now = clock.now()
    today = clock.today()
    day = data.session_date or today
    if day < today:
        raise BusinessRuleError("Sessions cannot be created for past dates.", code="DATE_IN_PAST")
    restaurant = _ensure_restaurant_orderable(db, data.restaurant_id)
    existing = session_for_date(db, day)
    if existing is not None:
        raise ConflictError(
            "A session already exists for this date. Edit or cancel it instead.",
            code="SESSION_EXISTS",
            details={"session_id": str(existing.id)},
        )
    settings = settings_service.get_app_settings(db)
    if data.opens_at is not None:
        opens_at = data.opens_at
    elif data.open_now and day == today:
        opens_at = now
    else:
        opens_at = business_datetime(day, _parse_hhmm(settings.default_opens_at))
        if day == today and opens_at > now and data.open_now:
            opens_at = now
    closes_at = data.closes_at
    if closes_at <= opens_at:
        raise BusinessRuleError("The deadline must be after the opening time.", code="INVALID_TIMES")
    if closes_at <= now:
        raise BusinessRuleError("The deadline must be in the future.", code="DEADLINE_IN_PAST")

    session = DailySession(
        session_date=day,
        restaurant_id=restaurant.id,
        opens_at=opens_at,
        closes_at=closes_at,
        status=SessionStatus.DRAFT,
        notes=data.notes,
        created_by=actor.id,
        fee_allocation=settings.default_fee_allocation,
    )
    db.add(session)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("A session already exists for this date.", code="SESSION_EXISTS") from exc
    audit_service.record(
        db,
        actor_id=actor.id,
        entity_type="session",
        entity_id=session.id,
        action="SESSION_CREATED",
        new=model_snapshot(session, SESSION_FIELDS),
    )
    if data.open_now:
        _open(db, actor, session, clock)
    db.commit()
    db.refresh(session)
    return session


def notify_opened(db: Session, session: DailySession, clock: Clock) -> None:
    restaurant_name = session.restaurant.name
    deadline = format_local_time(session.closes_at)
    if session.opens_at <= clock.now():
        notification_service.notify(
            db,
            notification_service.participant_ids(db),
            type=NotificationType.ORDERING_OPENED,
            title="Today's lunch is ready to order!",
            message=f"{restaurant_name} has been selected. Submit your order before {deadline}.",
            data={"session_id": str(session.id)},
            dedupe_prefix=f"session:{session.id}:opened:{session.restaurant_id}:{int(session.closes_at.timestamp())}",
        )
        session.open_notified_at = clock.now()
    else:
        notification_service.notify(
            db,
            notification_service.participant_ids(db),
            type=NotificationType.RESTAURANT_SELECTED,
            title="Lunch restaurant selected",
            message=f"{restaurant_name} has been selected. Ordering opens at "
            f"{format_local_time(session.opens_at)}.",
            data={"session_id": str(session.id)},
            dedupe_prefix=f"session:{session.id}:selected:{session.restaurant_id}",
        )


def _open(db: Session, actor: User | None, session: DailySession, clock: Clock) -> None:
    now = clock.now()
    if session.closes_at <= now:
        raise BusinessRuleError(
            "The deadline has already passed. Set a later deadline to reopen ordering.",
            code="DEADLINE_PASSED",
        )
    if session.session_date < clock.today():
        raise BusinessRuleError("Past sessions cannot be reopened.", code="SESSION_NOT_TODAY")
    previous_status = session.status
    session.status = SessionStatus.OPEN
    session.opened_at = session.opened_at or now
    session.closed_at = None
    audit_service.record(
        db,
        actor_id=actor.id if actor else None,
        entity_type="session",
        entity_id=session.id,
        action="SESSION_OPENED" if previous_status == SessionStatus.DRAFT else "SESSION_REOPENED",
        previous={"status": previous_status},
        new={"status": session.status, "closes_at": session.closes_at},
    )
    notify_opened(db, session, clock)


def open_session(
    db: Session, actor: User, session_id: uuid.UUID, closes_at: datetime | None, clock: Clock
) -> DailySession:
    session = get_session(db, session_id, lock=True)
    if session.status not in (SessionStatus.DRAFT, SessionStatus.CLOSED):
        raise ConflictError(
            f"A {session.status.lower()} session cannot be opened.", code="INVALID_SESSION_TRANSITION"
        )
    _ensure_restaurant_orderable(db, session.restaurant_id)
    if closes_at is not None:
        if closes_at.tzinfo is None:
            raise BusinessRuleError("Datetimes must include a timezone offset.", code="VALIDATION_ERROR")
        if closes_at <= session.opens_at:
            raise BusinessRuleError("The deadline must be after the opening time.", code="INVALID_TIMES")
        session.closes_at = closes_at
    _open(db, actor, session, clock)
    db.commit()
    db.refresh(session)
    return session


def _participant_count(db: Session) -> int:
    return len(notification_service.participant_ids(db))


def close_session(db: Session, actor: User | None, session_id: uuid.UUID, clock: Clock) -> DailySession:
    session = get_session(db, session_id, lock=True)
    if session.status != SessionStatus.OPEN:
        raise ConflictError("Only an open session can be closed.", code="INVALID_SESSION_TRANSITION")
    close_locked(db, actor, session, clock)
    db.commit()
    db.refresh(session)
    return session


def close_locked(db: Session, actor: User | None, session: DailySession, clock: Clock) -> None:
    session.status = SessionStatus.CLOSED
    session.closed_at = clock.now()
    session.participants_snapshot = _participant_count(db)
    audit_service.record(
        db,
        actor_id=actor.id if actor else None,
        entity_type="session",
        entity_id=session.id,
        action="SESSION_CLOSED" if actor else "SESSION_AUTO_CLOSED",
        previous={"status": SessionStatus.OPEN},
        new={"status": SessionStatus.CLOSED},
    )
    if session.session_date == clock.today():
        notification_service.notify(
            db,
            notification_service.participant_ids(db),
            type=NotificationType.SESSION_CLOSED,
            title="Ordering is closed",
            message=f"Ordering from {session.restaurant.name} is now closed.",
            data={"session_id": str(session.id)},
            dedupe_prefix=f"session:{session.id}:closed:{int(session.closed_at.timestamp())}",
        )


def finalize_session(db: Session, actor: User, session_id: uuid.UUID, clock: Clock) -> DailySession:
    session = get_session(db, session_id, lock=True)
    if session.status == SessionStatus.OPEN:
        raise ConflictError("Close ordering before finalizing the session.", code="SESSION_STILL_OPEN")
    if session.status != SessionStatus.CLOSED:
        raise ConflictError("Only a closed session can be finalized.", code="INVALID_SESSION_TRANSITION")
    session.status = SessionStatus.FINALIZED
    session.finalized_at = clock.now()
    if session.participants_snapshot is None:
        session.participants_snapshot = _participant_count(db)
    audit_service.record(
        db,
        actor_id=actor.id,
        entity_type="session",
        entity_id=session.id,
        action="SESSION_FINALIZED",
        previous={"status": SessionStatus.CLOSED},
        new={"status": SessionStatus.FINALIZED},
    )
    orderers = [o.employee_id for o in active_orders(db, session.id)]
    notification_service.notify(
        db,
        orderers,
        type=NotificationType.SESSION_FINALIZED,
        title="Lunch order finalized",
        message=f"The {session.restaurant.name} order has been finalized by the administrator.",
        data={"session_id": str(session.id)},
        dedupe_prefix=f"session:{session.id}:finalized",
    )
    db.commit()
    db.refresh(session)
    return session


def _cancel_orders(
    db: Session, actor: User | None, session: DailySession, reason: str, clock: Clock
) -> list[Order]:
    orders = active_orders(db, session.id)
    now = clock.now()
    for order in orders:
        order.status = OrderStatus.CANCELLED
        order.cancelled_at = now
        order.cancelled_by = actor.id if actor else None
        order.cancel_reason = reason
        order.revision += 1
        db.add(
            OrderRevision(
                order_id=order.id,
                revision_no=order.revision,
                action=RevisionAction.SESSION_CANCELLED,
                actor_user_id=actor.id if actor else None,
                reason=reason,
                snapshot={"status": OrderStatus.CANCELLED, "total_amount": f"{order.total_amount:.2f}"},
            )
        )
    if orders:
        notification_service.notify(
            db,
            [o.employee_id for o in orders],
            type=NotificationType.ORDER_CANCELLED,
            title="Your lunch order was cancelled",
            message=f"Your order was cancelled by the administrator: {reason}",
            data={"session_id": str(session.id)},
            dedupe_prefix=f"session:{session.id}:orders-cancelled:{int(now.timestamp())}",
        )
    return orders


def cancel_session(
    db: Session, actor: User, session_id: uuid.UUID, reason: str, clock: Clock
) -> DailySession:
    session = get_session(db, session_id, lock=True)
    if session.status in (SessionStatus.FINALIZED, SessionStatus.CANCELLED):
        raise ConflictError(
            f"A {session.status.lower()} session cannot be cancelled.", code="INVALID_SESSION_TRANSITION"
        )
    previous_status = session.status
    orders = _cancel_orders(db, actor, session, reason, clock)
    session.status = SessionStatus.CANCELLED
    session.cancelled_at = clock.now()
    session.cancel_reason = reason
    audit_service.record(
        db,
        actor_id=actor.id,
        entity_type="session",
        entity_id=session.id,
        action="SESSION_CANCELLED",
        previous={"status": previous_status},
        new={"status": SessionStatus.CANCELLED, "orders_cancelled": len(orders)},
        reason=reason,
    )
    if previous_status != SessionStatus.DRAFT and session.session_date == clock.today():
        notification_service.notify(
            db,
            notification_service.participant_ids(db),
            type=NotificationType.SESSION_CANCELLED,
            title="Today's lunch ordering was cancelled",
            message=f"The administrator cancelled today's ordering session. {reason}",
            data={"session_id": str(session.id)},
            dedupe_prefix=f"session:{session.id}:cancelled",
        )
    db.commit()
    db.refresh(session)
    return session


def update_session(
    db: Session, actor: User, session_id: uuid.UUID, data: SessionUpdate, clock: Clock
) -> DailySession:
    session = get_session(db, session_id, lock=True)
    if session.status == SessionStatus.CANCELLED:
        raise ConflictError("A cancelled session cannot be edited.", code="SESSION_CANCELLED")
    if session.status == SessionStatus.FINALIZED:
        if not data.admin_override:
            raise ConflictError(
                "This session is finalized and locked. Use an audited admin override to change it.",
                code="SESSION_FINALIZED",
            )
        if not data.reason:
            raise BusinessRuleError(
                "A reason is required to change a finalized session.", code="REASON_REQUIRED"
            )

    previous = model_snapshot(session, SESSION_FIELDS)
    changes = data.model_dump(
        exclude_unset=True, exclude={"existing_orders_action", "reason", "admin_override"}
    )

    new_restaurant_id = changes.pop("restaurant_id", None)
    if new_restaurant_id and new_restaurant_id != session.restaurant_id:
        if session.status == SessionStatus.FINALIZED:
            raise ConflictError(
                "The restaurant of a finalized session cannot change.", code="SESSION_FINALIZED"
            )
        _ensure_restaurant_orderable(db, new_restaurant_id)
        orders = active_orders(db, session.id)
        if orders and data.existing_orders_action != "cancel":
            raise ConflictError(
                f"{len(orders)} employee(s) already ordered from the current restaurant. "
                "Confirm cancelling their orders to change the restaurant.",
                code="SESSION_HAS_ORDERS",
                details={"order_count": len(orders)},
            )
        reason = data.reason or "The lunch restaurant was changed."
        _cancel_orders(db, actor, session, reason, clock)
        session.restaurant_id = new_restaurant_id
        db.flush()
        db.refresh(session)
        if session.status == SessionStatus.OPEN:
            notify_opened(db, session, clock)

    opens_at = changes.pop("opens_at", None) or session.opens_at
    closes_at = changes.pop("closes_at", None) or session.closes_at
    if closes_at <= opens_at:
        raise BusinessRuleError("The deadline must be after the opening time.", code="INVALID_TIMES")
    if session.status == SessionStatus.OPEN and closes_at != session.closes_at and closes_at <= clock.now():
        raise BusinessRuleError(
            "The new deadline is in the past. Close the session instead.", code="DEADLINE_IN_PAST"
        )
    session.opens_at, session.closes_at = opens_at, closes_at

    for field, value in changes.items():
        if field in {"delivery_fee", "service_fee"} and value is None:
            continue
        if field == "fee_allocation" and value is not None:
            value = value.value if hasattr(value, "value") else value
        setattr(session, field, value)

    audit_service.record(
        db,
        actor_id=actor.id,
        entity_type="session",
        entity_id=session.id,
        action="SESSION_ADMIN_OVERRIDE" if session.status == SessionStatus.FINALIZED else "SESSION_UPDATED",
        previous=previous,
        new=model_snapshot(session, SESSION_FIELDS),
        reason=data.reason,
    )
    db.commit()
    db.refresh(session)
    return session


def session_stats(db: Session, session: DailySession) -> dict:
    row = db.execute(
        select(
            func.count(Order.id),
            func.coalesce(func.sum(Order.total_amount), 0),
            func.coalesce(func.sum(Order.item_count), 0),
        ).where(Order.session_id == session.id, Order.status == OrderStatus.SUBMITTED)
    ).one()
    ordered, total_value, total_items = int(row[0]), row[1], int(row[2])
    if session.participants_snapshot is not None and session.status in (
        SessionStatus.CLOSED,
        SessionStatus.FINALIZED,
    ):
        participants = max(session.participants_snapshot, ordered)
    else:
        participants = max(_participant_count(db), ordered)
    return {
        "participants": participants,
        "ordered": ordered,
        "not_ordered": max(participants - ordered, 0),
        "total_items": total_items,
        "total_value": total_value,
    }


def history(db: Session, limit: int, offset: int, status: str | None = None):
    stmt = select(DailySession)
    if status:
        stmt = stmt.where(DailySession.status == status)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    sessions = list(
        db.scalars(
            stmt.order_by(DailySession.session_date.desc(), DailySession.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    )
    return sessions, total
