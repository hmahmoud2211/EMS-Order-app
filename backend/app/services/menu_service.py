"""Manual menu management: categories, items, modifier groups and modifiers.

Deleting a category or item archives it, so historical orders and imports keep
their references while employees no longer see it.
"""

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, selectinload

from app.core.errors import BusinessRuleError, ConflictError, NotFoundError
from app.models import MenuCategory, MenuItem, Modifier, ModifierGroup, User
from app.schemas.restaurant import (
    CategoryCreate,
    CategoryUpdate,
    MenuItemCreate,
    MenuItemUpdate,
    ModifierGroupIn,
    ModifierGroupUpdate,
    ModifierIn,
    ModifierUpdate,
)
from app.services import audit_service
from app.services.restaurant_service import get_restaurant
from app.utils.serialization import model_snapshot

ITEM_FIELDS = [
    "name",
    "description",
    "image_url",
    "base_price",
    "is_available",
    "category_id",
    "display_order",
]


def _next_order(db: Session, column, *conditions) -> int:
    current = db.scalar(select(func.max(column)).where(*conditions))
    return (current or 0) + 1


# ---- Categories -----------------------------------------------------------


def get_category(db: Session, category_id: uuid.UUID) -> MenuCategory:
    category = db.get(MenuCategory, category_id)
    if category is None or category.is_archived:
        raise NotFoundError("Category not found.", code="CATEGORY_NOT_FOUND")
    return category


def create_category(db: Session, actor: User, restaurant_id: uuid.UUID, data: CategoryCreate) -> MenuCategory:
    get_restaurant(db, restaurant_id)
    exists = db.scalar(
        select(MenuCategory.id).where(
            MenuCategory.restaurant_id == restaurant_id,
            func.lower(MenuCategory.name) == data.name.strip().lower(),
            MenuCategory.is_archived.is_(False),
        )
    )
    if exists:
        raise ConflictError("A category with this name already exists.", code="CATEGORY_EXISTS")
    category = MenuCategory(
        restaurant_id=restaurant_id,
        name=data.name.strip(),
        display_order=data.display_order
        if data.display_order is not None
        else _next_order(db, MenuCategory.display_order, MenuCategory.restaurant_id == restaurant_id),
    )
    db.add(category)
    db.flush()
    audit_service.record(
        db,
        actor_id=actor.id,
        entity_type="menu_category",
        entity_id=category.id,
        action="CATEGORY_CREATED",
        new={"name": category.name, "restaurant_id": restaurant_id},
    )
    db.commit()
    return category


def update_category(db: Session, actor: User, category_id: uuid.UUID, data: CategoryUpdate) -> MenuCategory:
    category = get_category(db, category_id)
    previous = {"name": category.name, "display_order": category.display_order}
    if data.name is not None:
        category.name = data.name.strip()
    if data.display_order is not None:
        category.display_order = data.display_order
    audit_service.record(
        db,
        actor_id=actor.id,
        entity_type="menu_category",
        entity_id=category.id,
        action="CATEGORY_UPDATED",
        previous=previous,
        new={"name": category.name, "display_order": category.display_order},
    )
    db.commit()
    return category


def delete_category(db: Session, actor: User, category_id: uuid.UUID, archive_items: bool) -> None:
    category = get_category(db, category_id)
    active_items = (
        db.scalar(
            select(func.count())
            .select_from(MenuItem)
            .where(MenuItem.category_id == category.id, MenuItem.is_archived.is_(False))
        )
        or 0
    )
    if active_items and not archive_items:
        raise ConflictError(
            "This category still contains items. Move them or confirm removing them too.",
            code="CATEGORY_NOT_EMPTY",
            details={"item_count": active_items},
        )
    db.execute(update(MenuItem).where(MenuItem.category_id == category.id).values(is_archived=True))
    category.is_archived = True
    audit_service.record(
        db,
        actor_id=actor.id,
        entity_type="menu_category",
        entity_id=category.id,
        action="CATEGORY_ARCHIVED",
        new={"archived_items": active_items},
    )
    db.commit()


# ---- Items ----------------------------------------------------------------


def get_item(db: Session, item_id: uuid.UUID) -> MenuItem:
    item = db.scalar(
        select(MenuItem)
        .where(MenuItem.id == item_id)
        .options(selectinload(MenuItem.modifier_groups).selectinload(ModifierGroup.modifiers))
    )
    if item is None or item.is_archived:
        raise NotFoundError("Menu item not found.", code="ITEM_NOT_FOUND")
    return item


def _build_group(data: ModifierGroupIn, order: int) -> ModifierGroup:
    group = ModifierGroup(
        name=data.name.strip(),
        minimum_selections=data.minimum_selections,
        maximum_selections=data.maximum_selections,
        is_required=data.is_required,
        display_order=data.display_order if data.display_order is not None else order,
    )
    for idx, mod in enumerate(data.modifiers):
        group.modifiers.append(
            Modifier(
                name=mod.name.strip(),
                additional_price=mod.additional_price,
                is_available=mod.is_available,
                display_order=mod.display_order if mod.display_order is not None else idx,
            )
        )
    _validate_group(group)
    return group


def _validate_group(group: ModifierGroup) -> None:
    if group.is_required and group.minimum_selections < 1:
        group.minimum_selections = 1
    if group.maximum_selections < group.minimum_selections:
        raise BusinessRuleError(
            "Maximum selections must be greater than or equal to minimum selections.",
            code="INVALID_MODIFIER_GROUP",
        )
    if group.modifiers and group.minimum_selections > len(group.modifiers):
        raise BusinessRuleError(
            f"“{group.name}” requires {group.minimum_selections} selection(s) but has only "
            f"{len(group.modifiers)} option(s).",
            code="INVALID_MODIFIER_GROUP",
        )


def create_item(db: Session, actor: User, restaurant_id: uuid.UUID, data: MenuItemCreate) -> MenuItem:
    get_restaurant(db, restaurant_id)
    category = get_category(db, data.category_id)
    if category.restaurant_id != restaurant_id:
        raise BusinessRuleError("The category belongs to another restaurant.", code="CATEGORY_MISMATCH")
    item = MenuItem(
        restaurant_id=restaurant_id,
        category_id=category.id,
        name=data.name.strip(),
        description=(data.description or "").strip() or None,
        image_url=data.image_url,
        base_price=data.base_price,
        is_available=data.is_available,
        display_order=data.display_order
        if data.display_order is not None
        else _next_order(db, MenuItem.display_order, MenuItem.category_id == category.id),
    )
    for idx, group in enumerate(data.modifier_groups):
        item.modifier_groups.append(_build_group(group, idx))
    db.add(item)
    db.flush()
    audit_service.record(
        db,
        actor_id=actor.id,
        entity_type="menu_item",
        entity_id=item.id,
        action="ITEM_CREATED",
        new=model_snapshot(item, ITEM_FIELDS),
    )
    db.commit()
    return get_item(db, item.id)


def update_item(db: Session, actor: User, item_id: uuid.UUID, data: MenuItemUpdate) -> MenuItem:
    item = get_item(db, item_id)
    previous = model_snapshot(item, ITEM_FIELDS)
    changes = data.model_dump(exclude_unset=True)
    if "category_id" in changes and changes["category_id"] is not None:
        category = get_category(db, changes["category_id"])
        if category.restaurant_id != item.restaurant_id:
            raise BusinessRuleError("The category belongs to another restaurant.", code="CATEGORY_MISMATCH")
    for field, value in changes.items():
        if value is None and field in {"name", "base_price", "category_id", "is_available"}:
            continue
        if isinstance(value, str):
            value = value.strip() or None
        setattr(item, field, value)
    audit_service.record(
        db,
        actor_id=actor.id,
        entity_type="menu_item",
        entity_id=item.id,
        action="ITEM_UPDATED",
        previous=previous,
        new=model_snapshot(item, ITEM_FIELDS),
    )
    db.commit()
    return get_item(db, item.id)


def archive_item(db: Session, actor: User, item_id: uuid.UUID) -> None:
    item = get_item(db, item_id)
    item.is_archived = True
    audit_service.record(
        db,
        actor_id=actor.id,
        entity_type="menu_item",
        entity_id=item.id,
        action="ITEM_ARCHIVED",
        previous=model_snapshot(item, ITEM_FIELDS),
    )
    db.commit()


# ---- Modifier groups / modifiers -----------------------------------------------


def add_modifier_group(db: Session, actor: User, item_id: uuid.UUID, data: ModifierGroupIn) -> MenuItem:
    item = get_item(db, item_id)
    group = _build_group(data, len(item.modifier_groups))
    group.menu_item_id = item.id
    db.add(group)
    db.flush()
    audit_service.record(
        db,
        actor_id=actor.id,
        entity_type="modifier_group",
        entity_id=group.id,
        action="MODIFIER_GROUP_CREATED",
        new={"item_id": item.id, "name": group.name, "modifiers": [m.name for m in group.modifiers]},
    )
    db.commit()
    db.expire(item)
    return get_item(db, item.id)


def get_group(db: Session, group_id: uuid.UUID) -> ModifierGroup:
    group = db.scalar(
        select(ModifierGroup)
        .where(ModifierGroup.id == group_id)
        .options(selectinload(ModifierGroup.modifiers))
    )
    if group is None:
        raise NotFoundError("Modifier group not found.", code="MODIFIER_GROUP_NOT_FOUND")
    return group


def update_modifier_group(
    db: Session, actor: User, group_id: uuid.UUID, data: ModifierGroupUpdate
) -> MenuItem:
    group = get_group(db, group_id)
    previous = model_snapshot(group, ["name", "minimum_selections", "maximum_selections", "is_required"])
    for field, value in data.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(group, field, value.strip() if isinstance(value, str) else value)
    _validate_group(group)
    audit_service.record(
        db,
        actor_id=actor.id,
        entity_type="modifier_group",
        entity_id=group.id,
        action="MODIFIER_GROUP_UPDATED",
        previous=previous,
        new=model_snapshot(group, ["name", "minimum_selections", "maximum_selections", "is_required"]),
    )
    db.commit()
    return get_item(db, group.menu_item_id)


def delete_modifier_group(db: Session, actor: User, group_id: uuid.UUID) -> MenuItem:
    group = get_group(db, group_id)
    item_id = group.menu_item_id
    audit_service.record(
        db,
        actor_id=actor.id,
        entity_type="modifier_group",
        entity_id=group.id,
        action="MODIFIER_GROUP_DELETED",
        previous={"name": group.name, "modifiers": [m.name for m in group.modifiers]},
    )
    db.delete(group)
    db.commit()
    db.expire_all()
    return get_item(db, item_id)


def add_modifier(db: Session, actor: User, group_id: uuid.UUID, data: ModifierIn) -> MenuItem:
    group = get_group(db, group_id)
    modifier = Modifier(
        modifier_group_id=group.id,
        name=data.name.strip(),
        additional_price=data.additional_price,
        is_available=data.is_available,
        display_order=data.display_order if data.display_order is not None else len(group.modifiers),
    )
    db.add(modifier)
    db.flush()
    audit_service.record(
        db,
        actor_id=actor.id,
        entity_type="modifier",
        entity_id=modifier.id,
        action="MODIFIER_CREATED",
        new={"group_id": group.id, "name": modifier.name, "additional_price": modifier.additional_price},
    )
    db.commit()
    db.expire_all()
    return get_item(db, group.menu_item_id)


def _get_modifier(db: Session, modifier_id: uuid.UUID) -> Modifier:
    modifier = db.get(Modifier, modifier_id)
    if modifier is None:
        raise NotFoundError("Modifier not found.", code="MODIFIER_NOT_FOUND")
    return modifier


def update_modifier(db: Session, actor: User, modifier_id: uuid.UUID, data: ModifierUpdate) -> MenuItem:
    modifier = _get_modifier(db, modifier_id)
    previous = model_snapshot(modifier, ["name", "additional_price", "is_available"])
    for field, value in data.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(modifier, field, value.strip() if isinstance(value, str) else value)
    audit_service.record(
        db,
        actor_id=actor.id,
        entity_type="modifier",
        entity_id=modifier.id,
        action="MODIFIER_UPDATED",
        previous=previous,
        new=model_snapshot(modifier, ["name", "additional_price", "is_available"]),
    )
    db.commit()
    group = get_group(db, modifier.modifier_group_id)
    return get_item(db, group.menu_item_id)


def delete_modifier(db: Session, actor: User, modifier_id: uuid.UUID) -> MenuItem:
    modifier = _get_modifier(db, modifier_id)
    group = get_group(db, modifier.modifier_group_id)
    remaining = len(group.modifiers) - 1
    if group.minimum_selections > remaining:
        raise BusinessRuleError(
            f"“{group.name}” needs at least {group.minimum_selections} option(s).",
            code="INVALID_MODIFIER_GROUP",
        )
    audit_service.record(
        db,
        actor_id=actor.id,
        entity_type="modifier",
        entity_id=modifier.id,
        action="MODIFIER_DELETED",
        previous={"name": modifier.name, "additional_price": modifier.additional_price},
    )
    db.delete(modifier)
    db.commit()
    db.expire_all()
    return get_item(db, group.menu_item_id)
