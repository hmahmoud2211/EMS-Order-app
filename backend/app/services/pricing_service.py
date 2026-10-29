"""Server-authoritative order pricing.

The client never decides prices. Every submission is re-priced from the database:
items must belong to the session's restaurant and be available, modifiers must
belong to the item and satisfy each group's min/max/required rules, and money is
computed with Decimal and ROUND_HALF_UP.
"""

import hashlib
import uuid
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.errors import BusinessRuleError, ConflictError
from app.models import MenuItem, Modifier, ModifierGroup
from app.schemas.order import OrderLineIn

CENT = Decimal("0.01")


def money(value: Decimal) -> Decimal:
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class PricedModifier:
    group_id: uuid.UUID
    group_name: str
    modifier_id: uuid.UUID
    name: str
    price: Decimal

    def snapshot(self) -> dict:
        return {
            "group_id": str(self.group_id),
            "group_name": self.group_name,
            "modifier_id": str(self.modifier_id),
            "name": self.name,
            "price": f"{self.price:.2f}",
        }


@dataclass
class PricedLine:
    menu_item_id: uuid.UUID
    name: str
    category_name: str | None
    quantity: int
    base_price: Decimal
    unit_price: Decimal
    line_total: Decimal
    modifiers: list[PricedModifier]
    special_instructions: str | None
    config_key: str


@dataclass
class PricedOrder:
    lines: list[PricedLine] = field(default_factory=list)

    @property
    def total(self) -> Decimal:
        return money(sum((line.line_total for line in self.lines), Decimal("0")))

    @property
    def item_count(self) -> int:
        return sum(line.quantity for line in self.lines)


def config_key(menu_item_id: uuid.UUID, modifier_ids: list[uuid.UUID]) -> str:
    """Identity of a meal configuration: same item + same modifiers = same configuration."""
    raw = f"{menu_item_id}|{','.join(sorted(str(m) for m in modifier_ids))}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def price_lines(
    db: Session,
    restaurant_id: uuid.UUID,
    lines: list[OrderLineIn],
    *,
    allow_unavailable: bool = False,
) -> PricedOrder:
    item_ids = {line.menu_item_id for line in lines}
    items = {
        item.id: item
        for item in db.scalars(
            select(MenuItem)
            .where(MenuItem.id.in_(item_ids))
            .options(
                joinedload(MenuItem.category),
                selectinload(MenuItem.modifier_groups).selectinload(ModifierGroup.modifiers),
            )
        ).unique()
    }

    priced = PricedOrder()
    for index, line in enumerate(lines):
        item = items.get(line.menu_item_id)
        if (
            item is None
            or item.restaurant_id != restaurant_id
            or item.is_archived
            or item.category.is_archived
        ):
            raise BusinessRuleError(
                "One or more items are not on today's menu. Please refresh the menu and try again.",
                code="ITEM_NOT_IN_MENU",
                details={"line": index, "menu_item_id": str(line.menu_item_id)},
            )
        if not item.is_available and not allow_unavailable:
            raise ConflictError(
                f"“{item.name}” is no longer available. Please remove it from your cart.",
                code="ITEM_UNAVAILABLE",
                details={"line": index, "menu_item_id": str(item.id), "name": item.name},
            )

        modifier_index: dict[uuid.UUID, tuple[ModifierGroup, Modifier]] = {
            modifier.id: (group, modifier) for group in item.modifier_groups for modifier in group.modifiers
        }
        selected: list[tuple[ModifierGroup, Modifier]] = []
        for modifier_id in line.modifier_ids:
            pair = modifier_index.get(modifier_id)
            if pair is None:
                raise BusinessRuleError(
                    f"An option selected for “{item.name}” is not valid.",
                    code="INVALID_MODIFIER",
                    details={"line": index, "modifier_id": str(modifier_id)},
                )
            if not pair[1].is_available and not allow_unavailable:
                raise ConflictError(
                    f"“{pair[1].name}” is no longer available for “{item.name}”.",
                    code="MODIFIER_UNAVAILABLE",
                    details={"line": index, "modifier_id": str(modifier_id), "name": pair[1].name},
                )
            selected.append(pair)

        for group in item.modifier_groups:
            count = sum(1 for g, _ in selected if g.id == group.id)
            minimum = max(group.minimum_selections, 1 if group.is_required else 0)
            if count < minimum:
                raise BusinessRuleError(
                    f"Please choose {group.name.lower()} for “{item.name}”."
                    if minimum == 1
                    else f"Please choose at least {minimum} options for {group.name} on “{item.name}”.",
                    code="MODIFIER_SELECTION_INVALID",
                    details={"line": index, "group_id": str(group.id), "minimum": minimum},
                )
            if count > group.maximum_selections:
                raise BusinessRuleError(
                    f"You can choose up to {group.maximum_selections} option(s) for {group.name} "
                    f"on “{item.name}”.",
                    code="MODIFIER_SELECTION_INVALID",
                    details={"line": index, "group_id": str(group.id), "maximum": group.maximum_selections},
                )

        selected.sort(key=lambda gm: (gm[0].display_order, gm[0].name, gm[1].display_order, gm[1].name))
        modifiers = [
            PricedModifier(
                group_id=g.id,
                group_name=g.name,
                modifier_id=m.id,
                name=m.name,
                price=money(m.additional_price),
            )
            for g, m in selected
        ]
        unit_price = money(item.base_price + sum((m.price for m in modifiers), Decimal("0")))
        priced.lines.append(
            PricedLine(
                menu_item_id=item.id,
                name=item.name,
                category_name=item.category.name,
                quantity=line.quantity,
                base_price=money(item.base_price),
                unit_price=unit_price,
                line_total=money(unit_price * line.quantity),
                modifiers=modifiers,
                special_instructions=line.special_instructions,
                config_key=config_key(item.id, [m.modifier_id for m in modifiers]),
            )
        )
    return priced
