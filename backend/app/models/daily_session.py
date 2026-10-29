import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamps, UUIDPrimaryKey
from app.models.enums import FeeAllocation, SessionStatus, enum_values
from app.models.restaurant import Restaurant


class DailySession(UUIDPrimaryKey, Timestamps, Base):
    """One company ordering day bound to exactly one restaurant."""

    __tablename__ = "daily_sessions"
    __table_args__ = (
        CheckConstraint(f"status IN ({enum_values(SessionStatus)})", name="status_valid"),
        CheckConstraint(f"fee_allocation IN ({enum_values(FeeAllocation)})", name="fee_allocation_valid"),
        CheckConstraint("closes_at > opens_at", name="closes_after_opens"),
        CheckConstraint("delivery_fee >= 0 AND service_fee >= 0", name="fees_non_negative"),
        # Business rule 1: one active (non-cancelled) session per company date.
        Index(
            "uq_daily_sessions_active_date",
            "session_date",
            unique=True,
            postgresql_where=text("status <> 'CANCELLED'"),
        ),
        Index("ix_daily_sessions_date", "session_date"),
    )

    session_date: Mapped[date] = mapped_column(Date)
    restaurant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("restaurants.id", ondelete="RESTRICT"))
    opens_at: Mapped[datetime]
    closes_at: Mapped[datetime]
    status: Mapped[str] = mapped_column(String(20), default=SessionStatus.DRAFT)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    delivery_fee: Mapped[Decimal] = mapped_column(default=Decimal("0.00"), server_default="0")
    service_fee: Mapped[Decimal] = mapped_column(default=Decimal("0.00"), server_default="0")
    fee_note: Mapped[str | None] = mapped_column(String(255))
    fee_allocation: Mapped[str] = mapped_column(String(20), default=FeeAllocation.NONE, server_default="NONE")
    opened_at: Mapped[datetime | None]
    closed_at: Mapped[datetime | None]
    finalized_at: Mapped[datetime | None]
    cancelled_at: Mapped[datetime | None]
    cancel_reason: Mapped[str | None] = mapped_column(String(255))
    open_notified_at: Mapped[datetime | None]
    # Number of active participants when ordering closed (keeps historical participation accurate).
    participants_snapshot: Mapped[int | None]

    restaurant: Mapped[Restaurant] = relationship(lazy="joined", innerjoin=True)
