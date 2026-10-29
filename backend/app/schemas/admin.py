import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import FeeAllocation
from app.schemas.common import Money
from app.schemas.order import OrderOut, SelectedModifierOut
from app.schemas.session import SessionOut


class DashboardMetrics(BaseModel):
    total_employees: int
    ordered: int
    not_ordered: int
    total_items: int
    total_value: Money
    participation_pct: float


class RecentOrder(BaseModel):
    order_id: uuid.UUID
    employee_name: str
    total_amount: Money
    item_count: int
    updated_at: datetime


class NotOrderedEmployee(BaseModel):
    id: uuid.UUID
    full_name: str
    department: str | None


class DashboardResponse(BaseModel):
    server_time: datetime
    business_date: date
    session: SessionOut | None
    metrics: DashboardMetrics | None
    recent_orders: list[RecentOrder]
    not_ordered: list[NotOrderedEmployee]
    seconds_until_close: int | None


class EmployeeStatusRow(BaseModel):
    employee_id: uuid.UUID
    full_name: str
    department: str | None
    status: Literal["ORDERED", "NOT_ORDERED"]
    order_id: uuid.UUID | None
    order_reference: str | None
    submitted_at: datetime | None
    updated_at: datetime | None
    total_amount: Money | None
    item_count: int


class EmployeeStatusResponse(BaseModel):
    session_id: uuid.UUID
    counts: dict[str, int]
    rows: list[EmployeeStatusRow]


class SessionOrdersResponse(BaseModel):
    session: SessionOut
    orders: list[OrderOut]


class ConsolidatedLine(BaseModel):
    item_name: str
    category_name: str | None
    quantity: int
    unit_price: Money
    modifiers: list[SelectedModifierOut]
    special_instructions: str | None
    line_total: Money


class ConsolidatedEmployee(BaseModel):
    employee_id: uuid.UUID
    full_name: str
    department: str | None
    order_reference: str
    lines: list[ConsolidatedLine]
    subtotal: Money
    allocated_fees: Money
    total: Money


class ConsolidatedItemEmployee(BaseModel):
    full_name: str
    quantity: int
    special_instructions: str | None


class ConsolidatedItem(BaseModel):
    config_key: str
    item_name: str
    category_name: str | None
    modifiers: list[SelectedModifierOut]
    unit_price: Money
    total_quantity: int
    total_value: Money
    order_count: int
    employees: list[ConsolidatedItemEmployee]


class ConsolidatedSummary(BaseModel):
    restaurant_name: str
    restaurant_branch: str | None
    restaurant_phone: str | None
    order_date: date
    session_status: str
    employees_ordered: int
    meals: int
    food_subtotal: Money
    delivery_fee: Money
    service_fee: Money
    fees_total: Money
    fee_note: str | None
    fee_allocation: str
    fees_are_admin_entered: bool = True
    final_total: Money


class ConsolidatedResponse(BaseModel):
    session: SessionOut
    summary: ConsolidatedSummary
    by_employee: list[ConsolidatedEmployee]
    by_item: list[ConsolidatedItem]
    generated_at: datetime


class SpendingPoint(BaseModel):
    session_date: date
    restaurant_name: str
    total_value: Money
    orders: int


class EmployeeSpending(BaseModel):
    employee_id: uuid.UUID
    full_name: str
    orders: int
    total_value: Money


class SpendingAnalytics(BaseModel):
    date_from: date
    date_to: date
    total_value: Money
    by_day: list[SpendingPoint]
    by_employee: list[EmployeeSpending]


class ParticipationPoint(BaseModel):
    session_date: date
    restaurant_name: str
    participants: int
    ordered: int
    rate_pct: float


class ParticipationAnalytics(BaseModel):
    date_from: date
    date_to: date
    average_rate_pct: float
    by_day: list[ParticipationPoint]


class AppSettingsOut(BaseModel):
    company_name: str
    allow_employee_cancellation: bool
    default_opens_at: str = Field(description="HH:MM business time")
    default_closes_at: str = Field(description="HH:MM business time")
    reminder_minutes_before_deadline: int
    default_fee_allocation: FeeAllocation
    currency: str


class AppSettingsUpdate(BaseModel):
    company_name: str | None = Field(default=None, min_length=1, max_length=120)
    allow_employee_cancellation: bool | None = None
    default_opens_at: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    default_closes_at: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    reminder_minutes_before_deadline: int | None = Field(default=None, ge=5, le=180)
    default_fee_allocation: FeeAllocation | None = None


class ProviderStatus(BaseModel):
    key: str
    name: str
    enabled: bool
    configured: bool
    capabilities: list[str]
    message: str


class OcrStatus(BaseModel):
    available: bool
    version: str | None
    languages: list[str]
    arabic_available: bool
    message: str
