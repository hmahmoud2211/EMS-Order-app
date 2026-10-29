import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamps, UUIDPrimaryKey
from app.models.daily_session import DailySession
from app.models.enums import OrderStatus, RevisionAction, enum_values
from app.models.user import User


class Order(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(f"status IN ({enum_values(OrderStatus)})", name="status_valid"),
        CheckConstraint("total_amount >= 0", name="total_non_negative"),
        # Business rule: exactly one active order per employee per daily session.
        Index(
            "uq_orders_active_employee_session",
            "session_id",
            "employee_id",
            unique=True,
            postgresql_where=text("status <> 'CANCELLED'"),
        ),
        Index("ix_orders_session_status", "session_id", "status"),
        Index("ix_orders_employee", "employee_id", "submitted_at"),
    )

    reference: Mapped[str] = mapped_column(String(24), unique=True)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("daily_sessions.id", ondelete="RESTRICT"))
    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    status: Mapped[str] = mapped_column(String(20), default=OrderStatus.SUBMITTED)
    total_amount: Mapped[Decimal]
    item_count: Mapped[int] = mapped_column(Integer, default=0)
    revision: Mapped[int] = mapped_column(Integer, default=1, server_default=text("1"))
    submitted_at: Mapped[datetime]
    cancelled_at: Mapped[datetime | None]
    cancelled_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    cancel_reason: Mapped[str | None] = mapped_column(String(255))

    session: Mapped[DailySession] = relationship(lazy="joined", innerjoin=True)
    employee: Mapped[User] = relationship(foreign_keys=[employee_id], lazy="joined", innerjoin=True)
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order",
        order_by="OrderItem.position",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class OrderItem(UUIDPrimaryKey, Base):
    """Immutable snapshot of an ordered menu configuration."""

    __tablename__ = "order_items"
    __table_args__ = (
        CheckConstraint("quantity BETWEEN 1 AND 50", name="quantity_range"),
        CheckConstraint("unit_price_snapshot >= 0 AND line_total >= 0", name="amounts_non_negative"),
    )

    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    menu_item_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("menu_items.id", ondelete="SET NULL"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    item_name_snapshot: Mapped[str] = mapped_column(String(160))
    category_name_snapshot: Mapped[str | None] = mapped_column(String(120))
    quantity: Mapped[int] = mapped_column(Integer)
    base_price_snapshot: Mapped[Decimal]
    unit_price_snapshot: Mapped[Decimal]
    selected_modifiers_snapshot: Mapped[list] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb")
    )
    special_instructions: Mapped[str | None] = mapped_column(String(300))
    line_total: Mapped[Decimal]
    config_key: Mapped[str] = mapped_column(String(64), index=True)

    order: Mapped[Order] = relationship(back_populates="items")


class OrderRevision(UUIDPrimaryKey, Base):
    __tablename__ = "order_revisions"
    __table_args__ = (
        CheckConstraint(f"action IN ({enum_values(RevisionAction)})", name="action_valid"),
        UniqueConstraint("order_id", "revision_no", name="uq_order_revisions_order_revision"),
    )

    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    revision_no: Mapped[int] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(String(30))
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reason: Mapped[str | None] = mapped_column(String(255))
    snapshot: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class IdempotencyKey(UUIDPrimaryKey, Base):
    __tablename__ = "idempotency_keys"
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_idempotency_keys_user_key"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    key: Mapped[str] = mapped_column(String(100))
    endpoint: Mapped[str] = mapped_column(String(100))
    request_hash: Mapped[str] = mapped_column(String(64))
    response_status: Mapped[int] = mapped_column(Integer)
    response_body: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), index=True)
