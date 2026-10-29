"""Test fixtures: a real PostgreSQL test database, migrated with Alembic, a frozen
business clock, and helpers to create users, restaurants and sessions."""

import os
import tempfile
from datetime import datetime, time
from decimal import Decimal
from zoneinfo import ZoneInfo

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://localhost:5432/ems_food_test")
os.environ["APP_ENV"] = "test"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["PUSH_ENABLED"] = "false"
os.environ["SMTP_HOST"] = ""
os.environ["MEDIA_ROOT"] = tempfile.mkdtemp(prefix="ems-food-media-")

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text

from alembic import command
from app.core.clock import FrozenClock, business_datetime, set_clock
from app.core.security import hash_password
from app.db.session import SessionLocal, engine
from app.main import app
from app.models import MenuCategory, MenuItem, Modifier, ModifierGroup, Restaurant, User
from app.models.enums import UserRole

CAIRO = ZoneInfo("Africa/Cairo")
PASSWORD = "Passw0rd!x"
# A regular Tuesday (no DST transition) at 10:00 Cairo time.
TEST_NOW = datetime(2026, 11, 3, 10, 0, tzinfo=CAIRO)


@pytest.fixture(scope="session", autouse=True)
def _database():
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
def _clean_tables():
    yield
    with engine.begin() as conn:
        tables = (
            conn.execute(
                text(
                    "SELECT tablename FROM pg_tables "
                    "WHERE schemaname='public' AND tablename <> 'alembic_version'"
                )
            )
            .scalars()
            .all()
        )
        conn.execute(text(f"TRUNCATE {', '.join(tables)} RESTART IDENTITY CASCADE"))


@pytest.fixture(autouse=True)
def clock():
    frozen = FrozenClock(TEST_NOW)
    set_clock(frozen)
    yield frozen


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def cairo(day_offset_hours: float = 0, at: time | None = None) -> datetime:
    if at is not None:
        return business_datetime(TEST_NOW.date(), at)
    from datetime import timedelta

    return TEST_NOW + timedelta(hours=day_offset_hours)


# ---- Factories ------------------------------------------------------------------


def make_user(db, username: str, role: UserRole = UserRole.EMPLOYEE, **kwargs) -> User:
    user = User(
        full_name=kwargs.pop("full_name", username.replace(".", " ").title()),
        username=username,
        role=role,
        password_hash=hash_password(kwargs.pop("password", PASSWORD)),
        participates_in_orders=kwargs.pop("participates_in_orders", role == UserRole.EMPLOYEE),
        department=kwargs.pop("department", "Engineering"),
        **kwargs,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def login(client: TestClient, username: str, password: str = PASSWORD) -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def make_restaurant(db, name: str = "Restaurant A") -> dict:
    """A restaurant with a burger (size + extras), fries, pasta and an unavailable drink."""
    restaurant = Restaurant(name=name, cuisine="Burgers", branch="Main")
    db.add(restaurant)
    db.flush()
    burgers = MenuCategory(restaurant_id=restaurant.id, name="Burgers", display_order=0)
    mains = MenuCategory(restaurant_id=restaurant.id, name="Mains", display_order=1)
    db.add_all([burgers, mains])
    db.flush()

    burger = MenuItem(
        restaurant_id=restaurant.id,
        category_id=burgers.id,
        name="Chicken Burger",
        base_price=Decimal("180.00"),
    )
    size = ModifierGroup(
        name="Size", minimum_selections=1, maximum_selections=1, is_required=True, display_order=0
    )
    regular = Modifier(name="Regular", additional_price=Decimal("0"), display_order=0)
    large = Modifier(name="Large", additional_price=Decimal("35"), display_order=1)
    size.modifiers.extend([regular, large])
    extras = ModifierGroup(name="Extras", minimum_selections=0, maximum_selections=2, display_order=1)
    cheese = Modifier(name="Cheese", additional_price=Decimal("20"), display_order=0)
    sauce = Modifier(name="Sauce", additional_price=Decimal("10"), display_order=1)
    bacon = Modifier(name="Bacon", additional_price=Decimal("30"), display_order=2, is_available=False)
    extras.modifiers.extend([cheese, sauce, bacon])
    burger.modifier_groups.extend([size, extras])

    fries = MenuItem(
        restaurant_id=restaurant.id, category_id=burgers.id, name="French Fries", base_price=Decimal("60.00")
    )
    pasta = MenuItem(
        restaurant_id=restaurant.id, category_id=mains.id, name="Chicken Pasta", base_price=Decimal("185.00")
    )
    juice = MenuItem(
        restaurant_id=restaurant.id,
        category_id=mains.id,
        name="Orange Juice",
        base_price=Decimal("55.00"),
        is_available=False,
    )
    db.add_all([burger, fries, pasta, juice])
    db.commit()
    return {
        "restaurant": restaurant,
        "burger": burger,
        "fries": fries,
        "pasta": pasta,
        "juice": juice,
        "regular": regular,
        "large": large,
        "cheese": cheese,
        "sauce": sauce,
        "bacon": bacon,
    }


@pytest.fixture
def admin(db) -> User:
    return make_user(db, "admin", UserRole.ADMIN, full_name="Admin User")


@pytest.fixture
def admin_headers(client, admin) -> dict[str, str]:
    return login(client, "admin")


@pytest.fixture
def menu(db) -> dict:
    return make_restaurant(db)


def open_session(client, admin_headers, restaurant_id, closes_at: datetime | None = None) -> dict:
    closes_at = closes_at or business_datetime(TEST_NOW.date(), time(12, 0))
    response = client.post(
        "/api/v1/sessions",
        json={"restaurant_id": str(restaurant_id), "closes_at": closes_at.isoformat(), "open_now": True},
        headers=admin_headers,
    )
    assert response.status_code == 201, response.text
    return response.json()
