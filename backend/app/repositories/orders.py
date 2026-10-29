"""Order queries."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Order
from app.models.enums import OrderStatus


def get(db: Session, order_id: uuid.UUID, *, lock: bool = False) -> Order | None:
    stmt = select(Order).where(Order.id == order_id)
    if lock:
        stmt = stmt.with_for_update(of=Order)
    return db.scalar(stmt)


def active_for(db: Session, session_id: uuid.UUID, employee_id: uuid.UUID) -> Order | None:
    """The employee's single active (submitted) order in a session, if any."""
    return db.scalar(
        select(Order).where(
            Order.session_id == session_id,
            Order.employee_id == employee_id,
            Order.status == OrderStatus.SUBMITTED,
        )
    )


def active_in_session(db: Session, session_id: uuid.UUID) -> list[Order]:
    return list(
        db.scalars(select(Order).where(Order.session_id == session_id, Order.status == OrderStatus.SUBMITTED))
    )
