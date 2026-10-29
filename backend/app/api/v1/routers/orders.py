import uuid

from fastapi import APIRouter, Depends, Header
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import Pagination, clock_dep, get_current_user, pagination
from app.core.clock import Clock
from app.db.session import get_db
from app.models import Order, User
from app.schemas.common import Page
from app.schemas.order import OrderHistoryItem, OrderOut, OrderSubmit, OrderUpdate
from app.services import order_service, session_service

router = APIRouter(prefix="/orders", tags=["orders"])


def history_item(order: Order) -> OrderHistoryItem:
    return OrderHistoryItem(
        id=order.id,
        reference=order.reference,
        status=order.status,
        total_amount=order.total_amount,
        item_count=order.item_count,
        submitted_at=order.submitted_at,
        session_date=order.session.session_date,
        restaurant_name=order.session.restaurant.name,
        item_names=[f"{i.quantity}× {i.item_name_snapshot}" for i in order.items],
    )


@router.get("/me/today", response_model=OrderOut | None)
def my_today(
    user: User = Depends(get_current_user), db: Session = Depends(get_db), clock: Clock = Depends(clock_dep)
):
    session = session_service.session_for_date(db, clock.today())
    if session is None:
        return None
    return order_service.active_order_for(db, session.id, user.id)


@router.get("/me/history", response_model=Page[OrderHistoryItem])
def my_history(
    page: Pagination = Depends(pagination),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    orders, total = order_service.my_history(db, user, page.limit, page.offset)
    return Page(items=[history_item(o) for o in orders], total=total, limit=page.limit, offset=page.offset)


@router.get("/me/{order_id}", response_model=OrderOut)
def my_order(order_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return order_service.get_own_order(db, user, order_id)


@router.post("", response_model=OrderOut, status_code=201)
def submit_order(
    body: OrderSubmit,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key", max_length=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    clock: Clock = Depends(clock_dep),
):
    status_code, payload = order_service.submit_order(db, user, body, idempotency_key, clock)
    return JSONResponse(payload, status_code=status_code)


@router.put("/{order_id}", response_model=OrderOut)
def update_order(
    order_id: uuid.UUID,
    body: OrderUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    clock: Clock = Depends(clock_dep),
):
    return order_service.update_order(db, user, order_id, body, clock)


@router.delete("/{order_id}", response_model=OrderOut)
def cancel_order(
    order_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    clock: Clock = Depends(clock_dep),
):
    return order_service.cancel_own_order(db, user, order_id, clock)
