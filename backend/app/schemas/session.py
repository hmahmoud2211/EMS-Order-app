import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.models.enums import FeeAllocation
from app.schemas.common import Money, MoneyInput, ORMModel
from app.schemas.restaurant import RestaurantSummary


class SessionCreate(BaseModel):
    restaurant_id: uuid.UUID
    session_date: date | None = Field(
        default=None, description="Business date (Africa/Cairo). Defaults to today."
    )
    opens_at: datetime | None = Field(
        default=None, description="Defaults to now or the configured opening time."
    )
    closes_at: datetime
    notes: str | None = Field(default=None, max_length=1000)
    open_now: bool = False

    @model_validator(mode="after")
    def _aware(self) -> "SessionCreate":
        for value in (self.opens_at, self.closes_at):
            if value is not None and value.tzinfo is None:
                raise ValueError("Datetimes must include a timezone offset.")
        if self.opens_at and self.closes_at <= self.opens_at:
            raise ValueError("The deadline must be after the opening time.")
        return self


class SessionUpdate(BaseModel):
    restaurant_id: uuid.UUID | None = None
    opens_at: datetime | None = None
    closes_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=1000)
    delivery_fee: MoneyInput | None = None
    service_fee: MoneyInput | None = None
    fee_note: str | None = Field(default=None, max_length=255)
    fee_allocation: FeeAllocation | None = None
    existing_orders_action: Literal["cancel"] | None = Field(
        default=None,
        description="Required when changing the restaurant of a session that already has orders.",
    )
    reason: str | None = Field(default=None, max_length=255)
    admin_override: bool = Field(default=False, description="Allow editing a finalized session (audited).")

    @model_validator(mode="after")
    def _aware(self) -> "SessionUpdate":
        for value in (self.opens_at, self.closes_at):
            if value is not None and value.tzinfo is None:
                raise ValueError("Datetimes must include a timezone offset.")
        return self


class SessionOpenRequest(BaseModel):
    closes_at: datetime | None = Field(
        default=None, description="Optionally set a new deadline when (re)opening."
    )


class SessionCancelRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=255)


class SessionOut(ORMModel):
    id: uuid.UUID
    session_date: date
    restaurant_id: uuid.UUID
    restaurant: RestaurantSummary
    opens_at: datetime
    closes_at: datetime
    status: str
    notes: str | None
    delivery_fee: Money
    service_fee: Money
    fee_note: str | None
    fee_allocation: str
    opened_at: datetime | None
    closed_at: datetime | None
    finalized_at: datetime | None
    cancelled_at: datetime | None
    cancel_reason: str | None
    created_at: datetime
    updated_at: datetime


class SessionStats(BaseModel):
    participants: int
    ordered: int
    not_ordered: int
    total_items: int
    total_value: Money


class SessionHistoryItem(SessionOut):
    stats: SessionStats


class MyOrderSummary(BaseModel):
    id: uuid.UUID
    reference: str
    status: str
    total_amount: Money
    item_count: int
    submitted_at: datetime
    updated_at: datetime


class TodayResponse(BaseModel):
    server_time: datetime
    business_date: date
    session: SessionOut | None
    is_accepting_orders: bool
    accepting_reason: str | None = Field(
        default=None, description="Machine code explaining why orders are not accepted."
    )
    can_cancel_order: bool
    my_order: MyOrderSummary | None
