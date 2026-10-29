"""Operational commands.

python -m app.cli create-admin                 # secure first-admin onboarding (interactive)
python -m app.cli seed-dev [--with-today]      # development-only fictional data
python -m app.cli generate-import-fixtures DIR # sample menu files (CSV/XLSX/PDF/PNG)
"""

import argparse
import getpass
import os
import random
import sys
from datetime import time, timedelta
from decimal import Decimal
from pathlib import Path

from sqlalchemy import func, select

from app.core.clock import business_datetime, get_clock
from app.core.config import get_settings
from app.core.security import generate_temporary_password, hash_password, validate_password_strength
from app.db.session import SessionLocal
from app.models import (
    DailySession,
    MenuCategory,
    MenuItem,
    Modifier,
    ModifierGroup,
    Order,
    OrderRevision,
    Restaurant,
    User,
)
from app.models.enums import OrderStatus, RestaurantSource, RevisionAction, SessionStatus, UserRole
from app.schemas.order import OrderLineIn
from app.services import pricing_service
from app.services.order_service import apply_lines, generate_reference


def create_admin(args: argparse.Namespace) -> int:
    db = SessionLocal()
    try:
        username = (args.username or input("Admin username: ")).strip().lower()
        full_name = (args.full_name or input("Full name: ")).strip()
        email = (
            args.email if args.email is not None else input("Email (optional): ")
        ).strip().lower() or None
        if not username or not full_name:
            print("Username and full name are required.", file=sys.stderr)
            return 1
        if db.scalar(select(User.id).where(User.username == username)):
            print(f"User '{username}' already exists.", file=sys.stderr)
            return 1
        password = os.environ.get("EMS_ADMIN_PASSWORD")
        if not password:
            password = getpass.getpass("Password: ")
            if password != getpass.getpass("Repeat password: "):
                print("Passwords do not match.", file=sys.stderr)
                return 1
        problem = validate_password_strength(password)
        if problem:
            print(problem, file=sys.stderr)
            return 1
        admin = User(
            full_name=full_name,
            username=username,
            email=email,
            role=UserRole.ADMIN,
            password_hash=hash_password(password),
            participates_in_orders=args.participates,
            must_change_password=False,
        )
        db.add(admin)
        db.commit()
        print(f"Administrator '{username}' created.")
        return 0
    finally:
        db.close()


# ---- Development seed -------------------------------------------------------------

FIRST = [
    "Ahmed",
    "Sara",
    "Omar",
    "Mona",
    "Karim",
    "Nour",
    "Youssef",
    "Hana",
    "Mostafa",
    "Laila",
    "Tarek",
    "Dina",
    "Hassan",
    "Yasmin",
    "Amr",
    "Reem",
    "Khaled",
    "Farida",
]
LAST = [
    "Kamal",
    "Nabil",
    "Fathy",
    "Samir",
    "Adel",
    "Hosny",
    "Ragab",
    "Zaki",
    "Fouad",
    "Mansour",
    "Shawky",
    "Lotfy",
    "Barakat",
    "Saleh",
    "Gaber",
    "Wahba",
    "Sabry",
    "Helmy",
]
DEPARTMENTS = ["Engineering", "Projects", "Finance", "Procurement", "IT", "Design", "HR"]

RESTAURANTS = [
    {
        "name": "Nile Burger Co.",
        "branch": "New Cairo",
        "cuisine": "Burgers",
        "description": "Smash burgers, crispy chicken and loaded fries.",
        "phone": "+20 100 000 0001",
        "address": "90th Street, New Cairo (fictional)",
        "menu": {
            "Burgers": [
                (
                    "Chicken Burger",
                    "Crispy chicken breast, lettuce, house sauce",
                    "180",
                    [
                        ("Size", 1, 1, [("Regular", "0"), ("Large", "35")]),
                        ("Extras", 0, 3, [("Cheese", "20"), ("Sauce", "10"), ("Jalapeños", "15")]),
                    ],
                ),
                (
                    "Classic Beef Burger",
                    "Beef patty, pickles, onions, cheddar",
                    "210",
                    [
                        ("Size", 1, 1, [("Single", "0"), ("Double", "70")]),
                        ("Extras", 0, 2, [("Bacon", "30"), ("Egg", "15")]),
                    ],
                ),
                ("Mushroom Swiss", "Beef, sautéed mushrooms, Swiss cheese", "230", []),
            ],
            "Sides": [
                (
                    "French Fries",
                    "Golden fries with sea salt",
                    "60",
                    [("Size", 1, 1, [("Regular", "0"), ("Large", "20")])],
                ),
                ("Onion Rings", "Beer-battered rings", "70", []),
            ],
            "Drinks": [("Cola", "330 ml can", "35", []), ("Mineral Water", "600 ml", "15", [])],
        },
    },
    {
        "name": "Pasta Piazza",
        "branch": "Maadi",
        "cuisine": "Italian",
        "description": "Fresh pasta, oven pizzas and salads.",
        "phone": "+20 100 000 0002",
        "address": "Road 9, Maadi (fictional)",
        "menu": {
            "Pasta": [
                (
                    "Chicken Pasta",
                    "Penne, grilled chicken, creamy white sauce",
                    "185",
                    [("Extras", 0, 2, [("Parmesan", "15"), ("Mushrooms", "20")])],
                ),
                ("Arrabbiata", "Penne in spicy tomato sauce", "150", []),
                ("Beef Lasagna", "Layers of pasta, beef ragù and béchamel", "220", []),
            ],
            "Pizza": [
                (
                    "Margherita",
                    "Tomato, mozzarella, basil",
                    "150",
                    [("Size", 1, 1, [("Medium", "0"), ("Large", "45")])],
                ),
                (
                    "Pepperoni",
                    "Tomato, mozzarella, beef pepperoni",
                    "190",
                    [("Size", 1, 1, [("Medium", "0"), ("Large", "50")])],
                ),
            ],
            "Salads": [
                (
                    "Caesar Salad",
                    "Romaine, croutons, parmesan, Caesar dressing",
                    "130",
                    [("Protein", 0, 1, [("Grilled chicken", "45"), ("Shrimp", "70")])],
                )
            ],
        },
    },
    {
        "name": "Koshary Corner",
        "branch": "Downtown",
        "cuisine": "Egyptian",
        "description": "Classic Egyptian comfort food.",
        "phone": "+20 100 000 0003",
        "address": "Tahrir Square area (fictional)",
        "menu": {
            "Koshary": [
                (
                    "Koshary",
                    "Rice, lentils, pasta, tomato sauce, crispy onions",
                    "55",
                    [
                        ("Size", 1, 1, [("Small", "0"), ("Medium", "15"), ("Large", "30")]),
                        ("Extras", 0, 2, [("Extra onions", "10"), ("Extra sauce", "5")]),
                    ],
                ),
            ],
            "Sandwiches": [
                ("Foul Sandwich", "Fava beans with tahini", "20", []),
                ("Taameya Sandwich", "Egyptian falafel with salad", "20", []),
                ("Liver Sandwich", "Alexandrian spicy liver", "45", []),
            ],
            "Desserts": [("Rice Pudding", "Roz bel laban", "35", [])],
        },
    },
    {
        "name": "Cairo Grill House",
        "branch": "Heliopolis",
        "cuisine": "Grills",
        "description": "Charcoal grills, kofta and mixed platters.",
        "phone": "+20 100 000 0004",
        "address": "Korba, Heliopolis (fictional)",
        "menu": {
            "Grills": [
                (
                    "Kofta Plate",
                    "Grilled kofta, rice, salad, tahini",
                    "240",
                    [("Side", 1, 1, [("Rice", "0"), ("Fries", "0"), ("Bread", "0")])],
                ),
                ("Shish Tawook", "Marinated chicken skewers, garlic sauce", "220", []),
                ("Mixed Grill", "Kofta, tawook and kebab", "320", []),
            ],
            "Salads": [("Tahini Salad", "", "30", []), ("Baba Ghanoush", "", "35", [])],
        },
    },
    {
        "name": "Green Bowl",
        "branch": "Zamalek",
        "cuisine": "Healthy",
        "description": "Bowls, wraps and fresh juices.",
        "phone": "+20 100 000 0005",
        "address": "26th of July Street, Zamalek (fictional)",
        "menu": {
            "Bowls": [
                (
                    "Chicken Quinoa Bowl",
                    "Quinoa, grilled chicken, avocado, greens",
                    "210",
                    [("Dressing", 1, 1, [("Lemon herb", "0"), ("Tahini", "0"), ("Honey mustard", "0")])],
                ),
                ("Salmon Poke", "Rice, salmon, edamame, mango", "290", []),
            ],
            "Wraps": [("Falafel Wrap", "Falafel, hummus, pickles", "95", [])],
            "Juices": [
                ("Green Detox", "Apple, cucumber, spinach, lemon", "70", []),
                ("Fresh Orange", "", "55", []),
            ],
        },
    },
]


def _seed_restaurants(db) -> list[Restaurant]:
    restaurants = []
    for spec in RESTAURANTS:
        restaurant = Restaurant(
            name=spec["name"],
            branch=spec["branch"],
            cuisine=spec["cuisine"],
            description=spec["description"],
            phone=spec["phone"],
            address=spec["address"],
            source_provider=RestaurantSource.MANUAL,
        )
        db.add(restaurant)
        db.flush()
        for c_order, (category_name, items) in enumerate(spec["menu"].items()):
            category = MenuCategory(restaurant_id=restaurant.id, name=category_name, display_order=c_order)
            db.add(category)
            db.flush()
            for i_order, (name, description, price, groups) in enumerate(items):
                item = MenuItem(
                    restaurant_id=restaurant.id,
                    category_id=category.id,
                    name=name,
                    description=description or None,
                    base_price=Decimal(price),
                    display_order=i_order,
                )
                for g_order, (group_name, minimum, maximum, modifiers) in enumerate(groups):
                    group = ModifierGroup(
                        name=group_name,
                        minimum_selections=minimum,
                        maximum_selections=maximum,
                        is_required=minimum > 0,
                        display_order=g_order,
                    )
                    for m_order, (mod_name, mod_price) in enumerate(modifiers):
                        group.modifiers.append(
                            Modifier(
                                name=mod_name, additional_price=Decimal(mod_price), display_order=m_order
                            )
                        )
                    item.modifier_groups.append(group)
                db.add(item)
        restaurants.append(restaurant)
    db.flush()
    return restaurants


def _random_lines(db, restaurant: Restaurant, rng: random.Random) -> list[OrderLineIn]:
    items = list(
        db.scalars(
            select(MenuItem).where(MenuItem.restaurant_id == restaurant.id, MenuItem.is_available.is_(True))
        )
    )
    lines = []
    for item in rng.sample(items, k=min(len(items), rng.choice([1, 1, 2]))):
        modifier_ids = []
        for group in item.modifier_groups:
            count = rng.randint(group.minimum_selections, min(group.maximum_selections, len(group.modifiers)))
            modifier_ids.extend(m.id for m in rng.sample(group.modifiers, k=count))
        lines.append(
            OrderLineIn(
                menu_item_id=item.id,
                quantity=rng.choice([1, 1, 1, 2]),
                modifier_ids=modifier_ids,
                special_instructions=rng.choice([None, None, None, "No onions", "Extra spicy please"]),
            )
        )
    return lines


def seed_dev(args: argparse.Namespace) -> int:
    settings = get_settings()
    if settings.app_env != "development":
        print("seed-dev only runs with APP_ENV=development.", file=sys.stderr)
        return 1
    db = SessionLocal()
    rng = random.Random(2026)
    clock = get_clock()
    try:
        if db.scalar(select(func.count()).select_from(User)) and not args.force:
            print(
                "The database already has users. Re-run with --force to add seed data anyway.",
                file=sys.stderr,
            )
            return 1
        admin_password = os.environ.get("SEED_ADMIN_PASSWORD") or generate_temporary_password()
        employee_password = os.environ.get("SEED_EMPLOYEE_PASSWORD") or generate_temporary_password()
        admin = User(
            full_name="EMS Administrator (Demo)",
            username="admin.demo",
            email="admin.demo@example.com",
            role=UserRole.ADMIN,
            password_hash=hash_password(admin_password),
            participates_in_orders=False,
            department="Administration",
        )
        db.add(admin)
        employees = []
        employee_hash = hash_password(employee_password)
        for i in range(18):
            username = f"{FIRST[i].lower()}.{LAST[i].lower()}"
            employees.append(
                User(
                    full_name=f"{FIRST[i]} {LAST[i]}",
                    username=username,
                    email=f"{username}@example.com",
                    department=DEPARTMENTS[i % len(DEPARTMENTS)],
                    role=UserRole.EMPLOYEE,
                    password_hash=employee_hash,
                    participates_in_orders=True,
                )
            )
        db.add_all(employees)
        db.flush()
        restaurants = _seed_restaurants(db)

        today = clock.today()
        day, created_days = today - timedelta(days=1), 0
        while created_days < 6:
            if day.weekday() in (4, 5):  # Friday/Saturday weekend in Egypt
                day -= timedelta(days=1)
                continue
            restaurant = restaurants[created_days % len(restaurants)]
            session = DailySession(
                session_date=day,
                restaurant_id=restaurant.id,
                opens_at=business_datetime(day, time(9, 0)),
                closes_at=business_datetime(day, time(12, 0)),
                status=SessionStatus.FINALIZED,
                created_by=admin.id,
                opened_at=business_datetime(day, time(9, 0)),
                closed_at=business_datetime(day, time(12, 0)),
                finalized_at=business_datetime(day, time(12, 30)),
                participants_snapshot=len(employees),
                delivery_fee=Decimal("30.00"),
                fee_note="Delivery (entered by admin)",
            )
            db.add(session)
            db.flush()
            for employee in rng.sample(employees, k=rng.randint(11, 17)):
                priced = pricing_service.price_lines(db, restaurant.id, _random_lines(db, restaurant, rng))
                submitted = business_datetime(day, time(rng.randint(9, 11), rng.randint(0, 59)))
                order = Order(
                    reference=generate_reference(session),
                    session_id=session.id,
                    employee_id=employee.id,
                    status=OrderStatus.SUBMITTED,
                    total_amount=priced.total,
                    item_count=priced.item_count,
                    submitted_at=submitted,
                )
                apply_lines(order, priced)
                db.add(order)
                db.flush()
                db.add(
                    OrderRevision(
                        order_id=order.id,
                        revision_no=1,
                        action=RevisionAction.CREATED,
                        actor_user_id=employee.id,
                        snapshot={"seed": True},
                    )
                )
            created_days += 1
            day -= timedelta(days=1)

        if args.with_today:
            now = clock.now()
            session = DailySession(
                session_date=today,
                restaurant_id=restaurants[0].id,
                opens_at=now - timedelta(minutes=5),
                closes_at=max(business_datetime(today, time(12, 0)), now + timedelta(hours=2)),
                status=SessionStatus.OPEN,
                created_by=admin.id,
                opened_at=now,
                open_notified_at=now,
            )
            db.add(session)
        db.commit()
        print("Development data created (all fictional).")
        print(f"  Admin login:     admin.demo / {admin_password}")
        print(f"  Employee logins: {employees[0].username} (and 17 others) / {employee_password}")
        print("  Store these now — passwords are not saved anywhere else.")
        return 0
    finally:
        db.close()


def generate_fixtures(args: argparse.Namespace) -> int:
    from app.utils.sample_menus import write_all

    for path in write_all(Path(args.directory)):
        print(f"wrote {path}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("create-admin", help="Create an administrator account (no defaults).")
    p.add_argument("--username")
    p.add_argument("--full-name")
    p.add_argument("--email")
    p.add_argument("--participates", action="store_true", help="The admin also orders lunch.")
    p.set_defaults(func=create_admin)

    p = sub.add_parser("seed-dev", help="Insert fictional development data (APP_ENV=development only).")
    p.add_argument("--with-today", action="store_true", help="Also open an ordering session for today.")
    p.add_argument("--force", action="store_true")
    p.set_defaults(func=seed_dev)

    p = sub.add_parser("generate-import-fixtures", help="Write sample menu files.")
    p.add_argument("directory")
    p.set_defaults(func=generate_fixtures)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
