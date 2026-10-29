"""Employee and admin order operations.

Submission algorithm (spec §10): authenticate → identify session → session OPEN →
deadline → restaurant → items → availability → modifiers → re-price → save in one
transaction (session row locked) → confirmation. Exactly one active order per
employee per session is enforced by a partial unique index, and network retries
are de-duplicated with idempotency keys.
"""

import hashlib
import json
import secrets
import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.core.errors import BusinessRuleError, ConflictError, ForbiddenError, NotFoundError
from app.models import DailySession, IdempotencyKey, Order, OrderItem, OrderRevision, User
from app.models.enums import NotificationType, OrderStatus, RevisionAction, SessionStatus
from app.repositories import orders as orders_repo
from app.schemas.order import (
    AdminOrderCreate,
    AdminOrderUpdate,
    OrderLineIn,
    OrderOut,
    OrderSubmit,
    OrderUpdate,
)
from app.services import audit_service, notification_service, pricing_service, settings_service
from app.services.pricing_service import PricedOrder
from app.services.session_service import ensure_accepting, format_local_time, get_session

SUBMIT_ENDPOINT = "POST /orders"
_REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_reference(session: DailySession) -> str:
    suffix = "".join(secrets.choice(_REFERENCE_ALPHABET) for _ in range(4))
    return f"EMS-{session.session_date:%m%d}-{suffix}"


def _request_hash(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


def _order_snapshot(order: Order) -> dict:
    return {
        "status": order.status,
        "total_amount": f"{order.total_amount:.2f}",
        "items": [
            {
                "menu_item_id": str(i.menu_item_id) if i.menu_item_id else None,
                "name": i.item_name_snapshot,
                "quantity": i.quantity,
                "unit_price": f"{i.unit_price_snapshot:.2f}",
                "modifiers": i.selected_modifiers_snapshot,
                "special_instructions": i.special_instructions,
                "line_total": f"{i.line_total:.2f}",
            }
            for i in order.items
        ],
    }


def apply_lines(order: Order, priced: PricedOrder) -> None:
    order.items.clear()
    for position, line in enumerate(priced.lines):
        order.items.append(
            OrderItem(
                menu_item_id=line.menu_item_id,
                position=position,
                item_name_snapshot=line.name,
                category_name_snapshot=line.category_name,
                quantity=line.quantity,
                base_price_snapshot=line.base_price,
                unit_price_snapshot=line.unit_price,
                selected_modifiers_snapshot=[m.snapshot() for m in line.modifiers],
                special_instructions=line.special_instructions,
                line_total=line.line_total,
                config_key=line.config_key,
            )
        )
    order.total_amount = priced.total
    order.item_count = priced.item_count


def _check_expected_total(priced: PricedOrder, expected: Decimal | None) -> None:
    if expected is None or pricing_service.money(expected) == priced.total:
        return
    raise ConflictError(
        "Prices changed since you opened the menu. Please review your updated cart.",
        code="PRICE_CHANGED",
        details={
            "expected_total": f"{pricing_service.money(expected):.2f}",
            "actual_total": f"{priced.total:.2f}",
            "lines": [
                {
                    "menu_item_id": str(line.menu_item_id),
                    "name": line.name,
                    "quantity": line.quantity,
                    "unit_price": f"{line.unit_price:.2f}",
                    "line_total": f"{line.line_total:.2f}",
                }
                for line in priced.lines
            ],
        },
    )


def _add_revision(
    db: Session, order: Order, action: RevisionAction, actor: User | None, reason: str | None = None
) -> None:
    db.add(
        OrderRevision(
            order_id=order.id,
            revision_no=order.revision,
            action=action,
            actor_user_id=actor.id if actor else None,
            reason=reason,
            snapshot=_order_snapshot(order),
        )
    )


def get_order(db: Session, order_id: uuid.UUID, *, lock: bool = False) -> Order:
    order = orders_repo.get(db, order_id, lock=lock)
    if order is None:
        raise NotFoundError("Order not found.", code="ORDER_NOT_FOUND")
    return order


def get_own_order(db: Session, user: User, order_id: uuid.UUID, *, lock: bool = False) -> Order:
    order = get_order(db, order_id, lock=lock)
    if order.employee_id != user.id:
        # Do not reveal that another employee's order exists.
        raise NotFoundError("Order not found.", code="ORDER_NOT_FOUND")
    return order


def active_order_for(db: Session, session_id: uuid.UUID, employee_id: uuid.UUID) -> Order | None:
    return orders_repo.active_for(db, session_id, employee_id)


def _new_order(session: DailySession, employee_id: uuid.UUID, priced: PricedOrder, now) -> Order:
    order = Order(
        reference=generate_reference(session),
        session_id=session.id,
        employee_id=employee_id,
        status=OrderStatus.SUBMITTED,
        total_amount=priced.total,
        item_count=priced.item_count,
        revision=1,
        submitted_at=now,
    )
    apply_lines(order, priced)
    return order


def submit_order(
    db: Session, user: User, payload: OrderSubmit, idempotency_key: str | None, clock: Clock
) -> tuple[int, dict]:
    """Returns (status_code, response_body). Replays return the original response."""
    request_hash = _request_hash(payload.model_dump(mode="json"))
    if idempotency_key:
        stored = db.scalar(
            select(IdempotencyKey).where(
                IdempotencyKey.user_id == user.id, IdempotencyKey.key == idempotency_key
            )
        )
        if stored is not None:
            if stored.request_hash != request_hash or stored.endpoint != SUBMIT_ENDPOINT:
                raise BusinessRuleError(
                    "This request key was already used for a different order.", code="IDEMPOTENCY_KEY_REUSED"
                )
            return stored.response_status, stored.response_body

    if not user.participates_in_orders:
        raise ForbiddenError("Your account is not set up to place lunch orders.", code="NOT_A_PARTICIPANT")

    session = get_session(db, payload.session_id, lock=True)
    ensure_accepting(session, clock)
    existing = active_order_for(db, session.id, user.id)
    if existing is not None:
        raise ConflictError(
            "You already submitted an order today. Edit it instead.",
            code="ORDER_EXISTS",
            details={"order_id": str(existing.id)},
        )
    priced = pricing_service.price_lines(db, session.restaurant_id, payload.items)
    _check_expected_total(priced, payload.expected_total)

    now = clock.now()
    order = _new_order(session, user.id, priced, now)
    db.add(order)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        if idempotency_key:
            stored = db.scalar(
                select(IdempotencyKey).where(
                    IdempotencyKey.user_id == user.id, IdempotencyKey.key == idempotency_key
                )
            )
            if stored is not None:
                return stored.response_status, stored.response_body
        existing = active_order_for(db, payload.session_id, user.id)
        raise ConflictError(
            "You already submitted an order today. Edit it instead.",
            code="ORDER_EXISTS",
            details={"order_id": str(existing.id) if existing else None},
        ) from exc

    _add_revision(db, order, RevisionAction.CREATED, user)
    notification_service.notify(
        db,
        [user.id],
        type=NotificationType.ORDER_SUBMITTED,
        title="Order submitted",
        message=f"Your order ({order.reference}) was submitted to EMS. Total: {order.total_amount:.2f} EGP.",
        data={"order_id": str(order.id), "session_id": str(session.id)},
        dedupe_prefix=f"order:{order.id}:submitted",
    )
    db.flush()
    db.refresh(order)
    body = OrderOut.model_validate(order).model_dump(mode="json")
    if idempotency_key:
        db.add(
            IdempotencyKey(
                user_id=user.id,
                key=idempotency_key,
                endpoint=SUBMIT_ENDPOINT,
                request_hash=request_hash,
                response_status=201,
                response_body=body,
            )
        )
    db.commit()
    return 201, body


def update_order(db: Session, user: User, order_id: uuid.UUID, payload: OrderUpdate, clock: Clock) -> Order:
    order = get_own_order(db, user, order_id, lock=True)
    if order.status != OrderStatus.SUBMITTED:
        raise ConflictError("This order was cancelled and can no longer be edited.", code="ORDER_CANCELLED")
    session = get_session(db, order.session_id, lock=True)
    ensure_accepting(session, clock)
    priced = pricing_service.price_lines(db, session.restaurant_id, payload.items)
    _check_expected_total(priced, payload.expected_total)
    apply_lines(order, priced)
    order.revision += 1
    db.flush()
    _add_revision(db, order, RevisionAction.UPDATED, user)
    notification_service.notify(
        db,
        [user.id],
        type=NotificationType.ORDER_MODIFIED,
        title="Order updated",
        message=f"Your order ({order.reference}) was updated. New total: {order.total_amount:.2f} EGP.",
        data={"order_id": str(order.id)},
        dedupe_prefix=f"order:{order.id}:rev:{order.revision}",
    )
    db.commit()
    db.refresh(order)
    return order


def cancel_own_order(db: Session, user: User, order_id: uuid.UUID, clock: Clock) -> Order:
    order = get_own_order(db, user, order_id, lock=True)
    if order.status != OrderStatus.SUBMITTED:
        raise ConflictError("This order is already cancelled.", code="ORDER_CANCELLED")
    if not settings_service.get_app_settings(db).allow_employee_cancellation:
        raise ForbiddenError(
            "Cancelling orders is disabled. Ask the administrator for help.", code="CANCELLATION_NOT_ALLOWED"
        )
    session = get_session(db, order.session_id, lock=True)
    ensure_accepting(session, clock)
    _cancel(db, order, user, "Cancelled by employee", RevisionAction.CANCELLED, clock)
    notification_service.notify(
        db,
        [user.id],
        type=NotificationType.ORDER_CANCELLED,
        title="Order cancelled",
        message=f"Your order ({order.reference}) was cancelled.",
        data={"order_id": str(order.id)},
        dedupe_prefix=f"order:{order.id}:cancelled",
    )
    db.commit()
    db.refresh(order)
    return order


def _cancel(
    db: Session, order: Order, actor: User, reason: str, action: RevisionAction, clock: Clock
) -> None:
    order.status = OrderStatus.CANCELLED
    order.cancelled_at = clock.now()
    order.cancelled_by = actor.id
    order.cancel_reason = reason
    order.revision += 1
    _add_revision(db, order, action, actor, reason)


# ---- Admin operations (audited exceptions) ----------------------------------


def _ensure_admin_can_edit(session: DailySession, admin_override: bool, reason: str) -> None:
    if session.status == SessionStatus.CANCELLED:
        raise ConflictError("The session was cancelled.", code="SESSION_CANCELLED")
    if session.status == SessionStatus.FINALIZED and not admin_override:
        raise ConflictError(
            "This session is finalized and locked. Confirm an admin override to change it.",
            code="SESSION_FINALIZED",
        )
    if not reason.strip():
        raise BusinessRuleError("A reason is required.", code="REASON_REQUIRED")


def admin_update_order(
    db: Session, admin: User, order_id: uuid.UUID, data: AdminOrderUpdate, clock: Clock
) -> Order:
    order = get_order(db, order_id, lock=True)
    if order.status != OrderStatus.SUBMITTED:
        raise ConflictError("A cancelled order cannot be modified.", code="ORDER_CANCELLED")
    session = get_session(db, order.session_id, lock=True)
    _ensure_admin_can_edit(session, data.admin_override, data.reason)
    previous = _order_snapshot(order)
    priced = pricing_service.price_lines(db, session.restaurant_id, data.items, allow_unavailable=True)
    apply_lines(order, priced)
    order.revision += 1
    db.flush()
    _add_revision(db, order, RevisionAction.ADMIN_MODIFIED, admin, data.reason)
    audit_service.record(
        db,
        actor_id=admin.id,
        entity_type="order",
        entity_id=order.id,
        action="ORDER_ADMIN_OVERRIDE"
        if session.status == SessionStatus.FINALIZED
        else "ORDER_ADMIN_MODIFIED",
        previous=previous,
        new=_order_snapshot(order),
        reason=data.reason,
    )
    notification_service.notify(
        db,
        [order.employee_id],
        type=NotificationType.ORDER_MODIFIED,
        title="Your order was updated by the administrator",
        message=f"Order {order.reference} was changed: {data.reason}. "
        f"New total: {order.total_amount:.2f} EGP.",
        data={"order_id": str(order.id)},
        dedupe_prefix=f"order:{order.id}:rev:{order.revision}",
    )
    db.commit()
    db.refresh(order)
    return order


def admin_cancel_order(
    db: Session, admin: User, order_id: uuid.UUID, reason: str, admin_override: bool, clock: Clock
) -> Order:
    order = get_order(db, order_id, lock=True)
    if order.status != OrderStatus.SUBMITTED:
        raise ConflictError("This order is already cancelled.", code="ORDER_CANCELLED")
    session = get_session(db, order.session_id, lock=True)
    _ensure_admin_can_edit(session, admin_override, reason)
    previous = _order_snapshot(order)
    _cancel(db, order, admin, reason, RevisionAction.ADMIN_CANCELLED, clock)
    audit_service.record(
        db,
        actor_id=admin.id,
        entity_type="order",
        entity_id=order.id,
        action="ORDER_ADMIN_CANCELLED",
        previous=previous,
        new={"status": OrderStatus.CANCELLED},
        reason=reason,
    )
    notification_service.notify(
        db,
        [order.employee_id],
        type=NotificationType.ORDER_CANCELLED,
        title="Your order was cancelled",
        message=f"Order {order.reference} was cancelled by the administrator: {reason}",
        data={"order_id": str(order.id)},
        dedupe_prefix=f"order:{order.id}:cancelled",
    )
    db.commit()
    db.refresh(order)
    return order


def admin_create_order(
    db: Session, admin: User, session_id: uuid.UUID, data: AdminOrderCreate, clock: Clock
) -> Order:
    session = get_session(db, session_id, lock=True)
    _ensure_admin_can_edit(session, data.admin_override, data.reason)
    employee = db.get(User, data.employee_id)
    if employee is None or not employee.is_active:
        raise NotFoundError("Employee not found or inactive.", code="EMPLOYEE_NOT_FOUND")
    if active_order_for(db, session.id, employee.id) is not None:
        raise ConflictError("This employee already has an order. Modify it instead.", code="ORDER_EXISTS")
    priced = pricing_service.price_lines(db, session.restaurant_id, data.items, allow_unavailable=True)
    order = _new_order(session, employee.id, priced, clock.now())
    db.add(order)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("This employee already has an order.", code="ORDER_EXISTS") from exc
    _add_revision(db, order, RevisionAction.ADMIN_CREATED, admin, data.reason)
    audit_service.record(
        db,
        actor_id=admin.id,
        entity_type="order",
        entity_id=order.id,
        action="ORDER_ADMIN_CREATED",
        new=_order_snapshot(order),
        reason=data.reason,
    )
    notification_service.notify(
        db,
        [employee.id],
        type=NotificationType.ORDER_SUBMITTED,
        title="An order was recorded for you",
        message=f"The administrator recorded order {order.reference} for you "
        f"({order.total_amount:.2f} EGP): {data.reason}",
        data={"order_id": str(order.id)},
        dedupe_prefix=f"order:{order.id}:submitted",
    )
    db.commit()
    db.refresh(order)
    return order


# ---- Queries -----------------------------------------------------------------------


def my_history(db: Session, user: User, limit: int, offset: int) -> tuple[list[Order], int]:
    stmt = select(Order).where(Order.employee_id == user.id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    orders = list(
        db.scalars(
            stmt.join(DailySession, DailySession.id == Order.session_id)
            .order_by(DailySession.session_date.desc(), Order.submitted_at.desc())
            .limit(limit)
            .offset(offset)
        )
    )
    return orders, total


def session_orders(db: Session, session_id: uuid.UUID, include_cancelled: bool) -> list[Order]:
    stmt = select(Order).where(Order.session_id == session_id)
    if not include_cancelled:
        stmt = stmt.where(Order.status == OrderStatus.SUBMITTED)
    orders = list(db.scalars(stmt))
    orders.sort(key=lambda o: (o.status != OrderStatus.SUBMITTED, o.employee.full_name.lower()))
    return orders


def deadline_text(session: DailySession) -> str:
    return format_local_time(session.closes_at)


def lines_from_order(order: Order) -> list[OrderLineIn]:
    """Rebuild submit lines from a stored order (used when cloning/editing)."""
    lines = []
    for item in order.items:
        if item.menu_item_id is None:
            continue
        lines.append(
            OrderLineIn(
                menu_item_id=item.menu_item_id,
                quantity=item.quantity,
                modifier_ids=[
                    uuid.UUID(m["modifier_id"])
                    for m in item.selected_modifiers_snapshot
                    if m.get("modifier_id")
                ],
                special_instructions=item.special_instructions,
            )
        )
    return lines
