import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import Money, MoneyInput, ORMModel
from app.schemas.restaurant import RestaurantSummary


class OrderLineIn(BaseModel):
    menu_item_id: uuid.UUID
    quantity: int = Field(ge=1, le=50)
    modifier_ids: list[uuid.UUID] = Field(default_factory=list, max_length=50)
    special_instructions: str | None = Field(default=None, max_length=300)

    @field_validator("special_instructions", mode="before")
    @classmethod
    def _clean(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = " ".join(str(v).split())
        return v or None

    @field_validator("modifier_ids")
    @classmethod
    def _unique(cls, v: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(set(v)) != len(v):
            raise ValueError("A modifier can only be selected once per item.")
        return v


class OrderSubmit(BaseModel):
    session_id: uuid.UUID
    items: list[OrderLineIn] = Field(min_length=1, max_length=30)
    expected_total: MoneyInput | None = Field(
        default=None,
        description=(
            "Total the client displayed. If it differs from the server total, PRICE_CHANGED is returned."
        ),
    )


class OrderUpdate(BaseModel):
    items: list[OrderLineIn] = Field(min_length=1, max_length=30)
    expected_total: MoneyInput | None = None


class AdminOrderUpdate(BaseModel):
    items: list[OrderLineIn] = Field(min_length=1, max_length=30)
    reason: str = Field(min_length=3, max_length=255)
    admin_override: bool = False


class AdminOrderCreate(BaseModel):
    employee_id: uuid.UUID
    items: list[OrderLineIn] = Field(min_length=1, max_length=30)
    reason: str = Field(min_length=3, max_length=255)
    admin_override: bool = False


class AdminOrderCancel(BaseModel):
    reason: str = Field(min_length=3, max_length=255)
    admin_override: bool = False


class SelectedModifierOut(BaseModel):
    group_id: str | None = None
    group_name: str
    modifier_id: str | None = None
    name: str
    price: Money


class OrderItemOut(ORMModel):
    id: uuid.UUID
    menu_item_id: uuid.UUID | None
    item_name_snapshot: str
    category_name_snapshot: str | None
    quantity: int
    base_price_snapshot: Money
    unit_price_snapshot: Money
    selected_modifiers_snapshot: list[SelectedModifierOut]
    special_instructions: str | None
    line_total: Money


class OrderEmployee(ORMModel):
    id: uuid.UUID
    full_name: str
    department: str | None


class OrderSessionInfo(ORMModel):
    id: uuid.UUID
    session_date: date
    status: str
    closes_at: datetime
    restaurant: RestaurantSummary


class OrderOut(ORMModel):
    id: uuid.UUID
    reference: str
    status: str
    total_amount: Money
    item_count: int
    revision: int
    submitted_at: datetime
    updated_at: datetime
    cancelled_at: datetime | None
    cancel_reason: str | None
    employee: OrderEmployee
    session: OrderSessionInfo
    items: list[OrderItemOut]


class OrderHistoryItem(BaseModel):
    id: uuid.UUID
    reference: str
    status: str
    total_amount: Money
    item_count: int
    submitted_at: datetime
    session_date: date
    restaurant_name: str
    item_names: list[str]


class PricedLine(BaseModel):
    menu_item_id: uuid.UUID
    name: str
    quantity: int
    unit_price: Money
    line_total: Money


class PriceChangedDetails(BaseModel):
    expected_total: Money
    actual_total: Money
    lines: list[PricedLine]


def money_str(value: Decimal) -> str:
    return f"{value:.2f}"
