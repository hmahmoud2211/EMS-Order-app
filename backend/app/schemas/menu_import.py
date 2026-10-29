import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ORMModel

ValidationStatus = Literal["VALID", "NEEDS_REVIEW", "INVALID"]


class DraftOption(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    price: Decimal | None = Field(default=None, ge=0, le=100000)


class DraftItem(BaseModel):
    """One extracted menu item, editable by the admin before publishing.

    `sizes[].price` is the *increment* over `base_price`; `extras[].price` is the extra charge.
    """

    id: str = Field(min_length=1, max_length=64)
    category: str = Field(default="Menu", max_length=120)
    name: str = Field(default="", max_length=160)
    description: str | None = Field(default=None, max_length=1000)
    base_price: Decimal | None = Field(default=None, ge=0, le=100000)
    sizes: list[DraftOption] = Field(default_factory=list, max_length=12)
    extras: list[DraftOption] = Field(default_factory=list, max_length=40)
    is_available: bool = True
    confidence: float = Field(default=1.0, ge=0, le=1)
    status: ValidationStatus = "VALID"
    issues: list[str] = Field(default_factory=list)
    duplicate_of: str | None = None
    source: dict | None = None

    @field_validator("name", "category", mode="before")
    @classmethod
    def _strip(cls, v: str | None) -> str:
        return " ".join(str(v or "").split())


class ImportDraft(BaseModel):
    items: list[DraftItem] = Field(default_factory=list, max_length=1500)
    categories: list[str] = Field(default_factory=list)
    meta: dict = Field(default_factory=dict)


class ImportDraftUpdate(BaseModel):
    items: list[DraftItem] = Field(max_length=1500)


class ImportApprove(BaseModel):
    mode: Literal["replace", "merge"]
    confirm_replace: bool = Field(
        default=False, description="Must be true for replace mode when a published menu already exists."
    )


class MenuImportOut(ORMModel):
    id: uuid.UUID
    restaurant_id: uuid.UUID
    source_type: str
    original_filename: str
    file_size: int
    status: str
    warnings: list
    error_message: str | None
    approved_at: datetime | None
    approval_mode: str | None
    stats: dict | None
    created_at: datetime
    updated_at: datetime


class MenuImportDetail(MenuImportOut):
    extraction_result: ImportDraft | None
