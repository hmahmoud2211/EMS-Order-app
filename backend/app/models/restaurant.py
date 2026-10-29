import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamps, UUIDPrimaryKey
from app.models.enums import RestaurantSource, enum_values


class Restaurant(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "restaurants"
    __table_args__ = (
        CheckConstraint(f"source_provider IN ({enum_values(RestaurantSource)})", name="source_valid"),
    )

    name: Mapped[str] = mapped_column(String(120), index=True)
    branch: Mapped[str | None] = mapped_column(String(120))
    cuisine: Mapped[str | None] = mapped_column(String(80))
    description: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(String(30))
    address: Mapped[str | None] = mapped_column(String(255))
    logo_url: Mapped[str | None] = mapped_column(String(500))
    cover_image_url: Mapped[str | None] = mapped_column(String(500))
    source_provider: Mapped[str] = mapped_column(String(20), default=RestaurantSource.MANUAL)
    external_reference: Mapped[str | None] = mapped_column(String(500))
    last_synced_at: Mapped[datetime | None]
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))

    categories: Mapped[list["MenuCategory"]] = relationship(
        back_populates="restaurant", order_by="MenuCategory.display_order"
    )


class MenuCategory(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "menu_categories"
    __table_args__ = (Index("ix_menu_categories_restaurant", "restaurant_id", "is_archived"),)

    restaurant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120))
    display_order: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))

    restaurant: Mapped[Restaurant] = relationship(back_populates="categories")
    items: Mapped[list["MenuItem"]] = relationship(
        back_populates="category", order_by="MenuItem.display_order"
    )


class MenuItem(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "menu_items"
    __table_args__ = (
        CheckConstraint("base_price >= 0", name="base_price_non_negative"),
        Index("ix_menu_items_restaurant", "restaurant_id", "is_archived"),
    )

    restaurant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"))
    category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("menu_categories.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500))
    base_price: Mapped[Decimal]
    currency: Mapped[str] = mapped_column(String(3), default="EGP", server_default="EGP")
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    display_order: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))

    category: Mapped[MenuCategory] = relationship(back_populates="items")
    modifier_groups: Mapped[list["ModifierGroup"]] = relationship(
        back_populates="menu_item",
        order_by="ModifierGroup.display_order",
        cascade="all, delete-orphan",
    )


class ModifierGroup(UUIDPrimaryKey, Base):
    __tablename__ = "modifier_groups"
    __table_args__ = (
        CheckConstraint("minimum_selections >= 0", name="min_non_negative"),
        CheckConstraint("maximum_selections >= 1", name="max_positive"),
        CheckConstraint("maximum_selections >= minimum_selections", name="max_gte_min"),
    )

    menu_item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("menu_items.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    minimum_selections: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    maximum_selections: Mapped[int] = mapped_column(Integer, default=1, server_default=text("1"))
    is_required: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    display_order: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))

    menu_item: Mapped[MenuItem] = relationship(back_populates="modifier_groups")
    modifiers: Mapped[list["Modifier"]] = relationship(
        back_populates="group", order_by="Modifier.display_order", cascade="all, delete-orphan"
    )


class Modifier(UUIDPrimaryKey, Base):
    __tablename__ = "modifiers"
    __table_args__ = (CheckConstraint("additional_price >= 0", name="price_non_negative"),)

    modifier_group_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("modifier_groups.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    additional_price: Mapped[Decimal] = mapped_column(default=Decimal("0.00"), server_default="0")
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    display_order: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))

    group: Mapped[ModifierGroup] = relationship(back_populates="modifiers")
