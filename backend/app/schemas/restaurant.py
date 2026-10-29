import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import Money, MoneyInput, ORMModel


def _clean(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    return v or None


class RestaurantBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    branch: str | None = Field(default=None, max_length=120)
    cuisine: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=2000)
    phone: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=255)
    logo_url: str | None = Field(default=None, max_length=500)
    cover_image_url: str | None = Field(default=None, max_length=500)
    external_reference: str | None = Field(default=None, max_length=500)
    is_active: bool = True

    @field_validator(
        "branch",
        "cuisine",
        "description",
        "phone",
        "address",
        "logo_url",
        "cover_image_url",
        "external_reference",
        mode="before",
    )
    @classmethod
    def _blank(cls, v: str | None) -> str | None:
        return _clean(v)

    @field_validator("external_reference")
    @classmethod
    def _url(cls, v: str | None) -> str | None:
        if v and not v.lower().startswith(("https://", "http://")):
            raise ValueError("External reference must be an http(s) URL.")
        return v


class RestaurantCreate(RestaurantBase):
    allow_duplicate: bool = False


class RestaurantUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    branch: str | None = Field(default=None, max_length=120)
    cuisine: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=2000)
    phone: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=255)
    logo_url: str | None = Field(default=None, max_length=500)
    cover_image_url: str | None = Field(default=None, max_length=500)
    external_reference: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None


class RestaurantOut(ORMModel):
    id: uuid.UUID
    name: str
    branch: str | None
    cuisine: str | None
    description: str | None
    phone: str | None
    address: str | None
    logo_url: str | None
    cover_image_url: str | None
    source_provider: str
    external_reference: str | None
    last_synced_at: datetime | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class RestaurantListItem(RestaurantOut):
    item_count: int = 0
    category_count: int = 0
    last_selected_on: str | None = None


class RestaurantSummary(ORMModel):
    id: uuid.UUID
    name: str
    branch: str | None
    cuisine: str | None
    description: str | None
    phone: str | None
    address: str | None
    logo_url: str | None
    cover_image_url: str | None


# ---- Menu -----------------------------------------------------------------


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    display_order: int | None = Field(default=None, ge=0, le=10000)


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    display_order: int | None = Field(default=None, ge=0, le=10000)


class ModifierIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    additional_price: MoneyInput = 0
    is_available: bool = True
    display_order: int | None = Field(default=None, ge=0)


class ModifierUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    additional_price: MoneyInput | None = None
    is_available: bool | None = None
    display_order: int | None = Field(default=None, ge=0)


class ModifierGroupIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    minimum_selections: int = Field(default=0, ge=0, le=50)
    maximum_selections: int = Field(default=1, ge=1, le=50)
    is_required: bool = False
    display_order: int | None = Field(default=None, ge=0)
    modifiers: list[ModifierIn] = Field(default_factory=list, max_length=60)

    @model_validator(mode="after")
    def _check(self) -> "ModifierGroupIn":
        if self.is_required and self.minimum_selections < 1:
            self.minimum_selections = 1
        if self.maximum_selections < self.minimum_selections:
            raise ValueError("Maximum selections must be greater than or equal to minimum selections.")
        return self


class ModifierGroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    minimum_selections: int | None = Field(default=None, ge=0, le=50)
    maximum_selections: int | None = Field(default=None, ge=1, le=50)
    is_required: bool | None = None
    display_order: int | None = Field(default=None, ge=0)


class MenuItemCreate(BaseModel):
    category_id: uuid.UUID
    name: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=1000)
    image_url: str | None = Field(default=None, max_length=500)
    base_price: MoneyInput
    is_available: bool = True
    display_order: int | None = Field(default=None, ge=0)
    modifier_groups: list[ModifierGroupIn] = Field(default_factory=list, max_length=20)


class MenuItemUpdate(BaseModel):
    category_id: uuid.UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=1000)
    image_url: str | None = Field(default=None, max_length=500)
    base_price: MoneyInput | None = None
    is_available: bool | None = None
    display_order: int | None = Field(default=None, ge=0)


class ModifierOut(ORMModel):
    id: uuid.UUID
    name: str
    additional_price: Money
    is_available: bool
    display_order: int


class ModifierGroupOut(ORMModel):
    id: uuid.UUID
    name: str
    minimum_selections: int
    maximum_selections: int
    is_required: bool
    display_order: int
    modifiers: list[ModifierOut]


class MenuItemOut(ORMModel):
    id: uuid.UUID
    category_id: uuid.UUID
    name: str
    description: str | None
    image_url: str | None
    base_price: Money
    currency: str
    is_available: bool
    display_order: int
    modifier_groups: list[ModifierGroupOut]


class CategoryOut(ORMModel):
    id: uuid.UUID
    name: str
    display_order: int
    items: list[MenuItemOut] = []


class MenuOut(BaseModel):
    restaurant: RestaurantSummary
    categories: list[CategoryOut]
    item_count: int
