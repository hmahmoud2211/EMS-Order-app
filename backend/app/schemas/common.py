from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer

T = TypeVar("T")

TWO_PLACES = Decimal("0.01")


def quantize_money(value: Decimal) -> Decimal:
    return Decimal(value).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


# Currency values travel as fixed-point strings ("180.00") so clients never use floats.
Money = Annotated[
    Decimal,
    PlainSerializer(lambda v: f"{quantize_money(v):.2f}", return_type=str, when_used="json"),
]

MoneyInput = Annotated[Decimal, Field(ge=0, le=Decimal("100000"), decimal_places=2)]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


class Message(BaseModel):
    message: str


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: object | None = None


class ErrorResponse(BaseModel):
    error: ErrorDetail
