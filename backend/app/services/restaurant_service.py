import uuid

from rapidfuzz import fuzz
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import ConflictError, NotFoundError
from app.models import DailySession, MenuCategory, MenuItem, ModifierGroup, Restaurant, User
from app.models.enums import RestaurantSource, SessionStatus
from app.schemas.restaurant import (
    CategoryOut,
    MenuItemOut,
    MenuOut,
    RestaurantCreate,
    RestaurantListItem,
    RestaurantSummary,
    RestaurantUpdate,
)
from app.services import audit_service
from app.utils.serialization import model_snapshot
from app.utils.text import normalize_name

AUDIT_FIELDS = [
    "name",
    "branch",
    "cuisine",
    "description",
    "phone",
    "address",
    "logo_url",
    "cover_image_url",
    "external_reference",
    "is_active",
]
DUPLICATE_THRESHOLD = 90


def get_restaurant(db: Session, restaurant_id: uuid.UUID) -> Restaurant:
    restaurant = db.get(Restaurant, restaurant_id)
    if restaurant is None:
        raise NotFoundError("Restaurant not found.", code="RESTAURANT_NOT_FOUND")
    return restaurant


def list_restaurants(
    db: Session, q: str | None, active: bool | None, limit: int, offset: int
) -> tuple[list[RestaurantListItem], int]:
    stmt = select(Restaurant)
    if active is not None:
        stmt = stmt.where(Restaurant.is_active.is_(active))
    if q:
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Restaurant.name).like(like),
                func.lower(func.coalesce(Restaurant.cuisine, "")).like(like),
                func.lower(func.coalesce(Restaurant.branch, "")).like(like),
            )
        )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    restaurants = list(db.scalars(stmt.order_by(Restaurant.name).limit(limit).offset(offset)))
    ids = [r.id for r in restaurants]
    item_counts = dict(
        db.execute(
            select(MenuItem.restaurant_id, func.count())
            .where(MenuItem.restaurant_id.in_(ids), MenuItem.is_archived.is_(False))
            .group_by(MenuItem.restaurant_id)
        ).all()
    )
    category_counts = dict(
        db.execute(
            select(MenuCategory.restaurant_id, func.count())
            .where(MenuCategory.restaurant_id.in_(ids), MenuCategory.is_archived.is_(False))
            .group_by(MenuCategory.restaurant_id)
        ).all()
    )
    last_selected = dict(
        db.execute(
            select(DailySession.restaurant_id, func.max(DailySession.session_date))
            .where(DailySession.restaurant_id.in_(ids), DailySession.status != SessionStatus.CANCELLED)
            .group_by(DailySession.restaurant_id)
        ).all()
    )
    items = []
    for r in restaurants:
        item = RestaurantListItem.model_validate(r)
        item.item_count = item_counts.get(r.id, 0)
        item.category_count = category_counts.get(r.id, 0)
        selected = last_selected.get(r.id)
        item.last_selected_on = selected.isoformat() if selected else None
        items.append(item)
    return items, total


def find_duplicates(db: Session, name: str, branch: str | None, exclude_id: uuid.UUID | None = None):
    key = normalize_name(f"{name} {branch or ''}")
    matches = []
    for r in db.scalars(select(Restaurant)):
        if r.id == exclude_id:
            continue
        score = fuzz.token_sort_ratio(key, normalize_name(f"{r.name} {r.branch or ''}"))
        if score >= DUPLICATE_THRESHOLD:
            matches.append({"id": str(r.id), "name": r.name, "branch": r.branch, "score": round(score)})
    return matches


def create_restaurant(db: Session, actor: User, data: RestaurantCreate) -> Restaurant:
    if not data.allow_duplicate:
        matches = find_duplicates(db, data.name, data.branch)
        if matches:
            raise ConflictError(
                "A restaurant with a very similar name and branch already exists.",
                code="DUPLICATE_RESTAURANT",
                details={"matches": matches},
            )
    restaurant = Restaurant(
        **data.model_dump(exclude={"allow_duplicate"}),
        source_provider=RestaurantSource.MANUAL,
    )
    db.add(restaurant)
    db.flush()
    audit_service.record(
        db,
        actor_id=actor.id,
        entity_type="restaurant",
        entity_id=restaurant.id,
        action="RESTAURANT_CREATED",
        new=model_snapshot(restaurant, AUDIT_FIELDS),
    )
    db.commit()
    return restaurant


def update_restaurant(
    db: Session, actor: User, restaurant_id: uuid.UUID, data: RestaurantUpdate
) -> Restaurant:
    restaurant = get_restaurant(db, restaurant_id)
    changes = data.model_dump(exclude_unset=True)
    if "name" in changes and not changes["name"]:
        changes.pop("name")
    previous = model_snapshot(restaurant, AUDIT_FIELDS)
    for field, value in changes.items():
        if isinstance(value, str):
            value = value.strip() or None
        setattr(restaurant, field, value)
    audit_service.record(
        db,
        actor_id=actor.id,
        entity_type="restaurant",
        entity_id=restaurant.id,
        action="RESTAURANT_UPDATED",
        previous=previous,
        new=model_snapshot(restaurant, AUDIT_FIELDS),
    )
    db.commit()
    db.refresh(restaurant)
    return restaurant


def load_menu(db: Session, restaurant: Restaurant, include_unavailable: bool = True) -> MenuOut:
    categories = list(
        db.scalars(
            select(MenuCategory)
            .where(MenuCategory.restaurant_id == restaurant.id, MenuCategory.is_archived.is_(False))
            .order_by(MenuCategory.display_order, MenuCategory.name)
        )
    )
    items_stmt = (
        select(MenuItem)
        .where(MenuItem.restaurant_id == restaurant.id, MenuItem.is_archived.is_(False))
        .options(selectinload(MenuItem.modifier_groups).selectinload(ModifierGroup.modifiers))
        .order_by(MenuItem.display_order, MenuItem.name)
    )
    if not include_unavailable:
        items_stmt = items_stmt.where(MenuItem.is_available.is_(True))
    items_by_category: dict[uuid.UUID, list[MenuItemOut]] = {}
    count = 0
    for item in db.scalars(items_stmt):
        items_by_category.setdefault(item.category_id, []).append(MenuItemOut.model_validate(item))
        count += 1
    out_categories = [
        CategoryOut(
            id=c.id, name=c.name, display_order=c.display_order, items=items_by_category.get(c.id, [])
        )
        for c in categories
    ]
    return MenuOut(
        restaurant=RestaurantSummary.model_validate(restaurant), categories=out_categories, item_count=count
    )


def menu_item_count(db: Session, restaurant_id: uuid.UUID, available_only: bool = False) -> int:
    stmt = (
        select(func.count())
        .select_from(MenuItem)
        .join(MenuCategory, MenuCategory.id == MenuItem.category_id)
        .where(
            MenuItem.restaurant_id == restaurant_id,
            MenuItem.is_archived.is_(False),
            MenuCategory.is_archived.is_(False),
        )
    )
    if available_only:
        stmt = stmt.where(MenuItem.is_available.is_(True))
    return db.scalar(stmt) or 0
