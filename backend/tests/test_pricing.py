import uuid
from decimal import Decimal

import pytest

from app.core.errors import BusinessRuleError, ConflictError
from app.schemas.order import OrderLineIn
from app.services.pricing_service import config_key, price_lines
from tests.conftest import make_restaurant


def line(item, qty=1, modifiers=(), note=None):
    return OrderLineIn(
        menu_item_id=item.id, quantity=qty, modifier_ids=[m.id for m in modifiers], special_instructions=note
    )


def test_spec_example_burger_large_with_extras(db, menu):
    # Chicken Burger 180 + Large 35 + Cheese 20 + Sauce 10 = 245 each, ×2 = 490
    priced = price_lines(
        db,
        menu["restaurant"].id,
        [line(menu["burger"], 2, [menu["large"], menu["cheese"], menu["sauce"]], "No onions")],
    )
    only = priced.lines[0]
    assert only.unit_price == Decimal("245.00")
    assert only.line_total == Decimal("490.00")
    assert priced.total == Decimal("490.00")
    assert priced.item_count == 2
    assert [m.name for m in only.modifiers] == ["Large", "Cheese", "Sauce"]
    assert only.special_instructions == "No onions"


def test_multiple_lines_total(db, menu):
    priced = price_lines(
        db, menu["restaurant"].id, [line(menu["burger"], 1, [menu["regular"]]), line(menu["fries"], 1)]
    )
    assert priced.total == Decimal("240.00")


def test_required_group_must_be_selected(db, menu):
    with pytest.raises(BusinessRuleError) as exc:
        price_lines(db, menu["restaurant"].id, [line(menu["burger"], 1, [menu["cheese"]])])
    assert exc.value.code == "MODIFIER_SELECTION_INVALID"


def test_single_choice_group_rejects_two_sizes(db, menu):
    with pytest.raises(BusinessRuleError) as exc:
        price_lines(db, menu["restaurant"].id, [line(menu["burger"], 1, [menu["regular"], menu["large"]])])
    assert exc.value.code == "MODIFIER_SELECTION_INVALID"


def test_modifier_from_another_item_is_invalid(db, menu):
    with pytest.raises(BusinessRuleError) as exc:
        price_lines(db, menu["restaurant"].id, [line(menu["fries"], 1, [menu["cheese"]])])
    assert exc.value.code == "INVALID_MODIFIER"


def test_unknown_modifier_is_invalid(db, menu):
    bogus = OrderLineIn(menu_item_id=menu["fries"].id, quantity=1, modifier_ids=[uuid.uuid4()])
    with pytest.raises(BusinessRuleError):
        price_lines(db, menu["restaurant"].id, [bogus])


def test_unavailable_item_and_modifier(db, menu):
    with pytest.raises(ConflictError) as exc:
        price_lines(db, menu["restaurant"].id, [line(menu["juice"])])
    assert exc.value.code == "ITEM_UNAVAILABLE"
    with pytest.raises(ConflictError) as exc:
        price_lines(db, menu["restaurant"].id, [line(menu["burger"], 1, [menu["regular"], menu["bacon"]])])
    assert exc.value.code == "MODIFIER_UNAVAILABLE"
    # Admin corrections may include unavailable items.
    priced = price_lines(db, menu["restaurant"].id, [line(menu["juice"])], allow_unavailable=True)
    assert priced.total == Decimal("55.00")


def test_item_from_another_restaurant_is_rejected(db, menu):
    other = make_restaurant(db, "Restaurant B")
    with pytest.raises(BusinessRuleError) as exc:
        price_lines(db, menu["restaurant"].id, [line(other["pasta"])])
    assert exc.value.code == "ITEM_NOT_IN_MENU"


def test_archived_item_is_rejected(db, menu):
    menu["pasta"].is_archived = True
    db.commit()
    with pytest.raises(BusinessRuleError):
        price_lines(db, menu["restaurant"].id, [line(menu["pasta"])])


def test_decimal_rounding_half_up(db, menu):
    menu["fries"].base_price = Decimal("10.05")
    db.commit()
    priced = price_lines(db, menu["restaurant"].id, [line(menu["fries"], 3)])
    assert priced.total == Decimal("30.15")


def test_config_key_ignores_modifier_order():
    item, a, b = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    assert config_key(item, [a, b]) == config_key(item, [b, a])
    assert config_key(item, [a]) != config_key(item, [b])
