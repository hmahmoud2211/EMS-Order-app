"""Dashboard metrics, participation, consolidated restaurant orders and analytics."""

import uuid
from collections import OrderedDict
from datetime import date
from decimal import ROUND_FLOOR, Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.models import DailySession, Order, User
from app.models.enums import FeeAllocation, OrderStatus, SessionStatus
from app.schemas.admin import (
    ConsolidatedEmployee,
    ConsolidatedItem,
    ConsolidatedItemEmployee,
    ConsolidatedLine,
    ConsolidatedResponse,
    ConsolidatedSummary,
    DashboardMetrics,
    DashboardResponse,
    EmployeeSpending,
    EmployeeStatusResponse,
    EmployeeStatusRow,
    NotOrderedEmployee,
    ParticipationAnalytics,
    ParticipationPoint,
    RecentOrder,
    SpendingAnalytics,
    SpendingPoint,
)
from app.schemas.order import SelectedModifierOut
from app.schemas.session import SessionOut
from app.services import session_service
from app.services.pricing_service import money

ZERO = Decimal("0.00")


def _participants(db: Session, session_id: uuid.UUID) -> list[User]:
    """Active ordering participants plus anyone who ordered in this session (even if since deactivated)."""
    ordered_ids = select(Order.employee_id).where(
        Order.session_id == session_id, Order.status == OrderStatus.SUBMITTED
    )
    return list(
        db.scalars(
            select(User)
            .where(
                or_(
                    (User.is_active.is_(True)) & (User.participates_in_orders.is_(True)),
                    User.id.in_(ordered_ids),
                )
            )
            .order_by(User.full_name)
        )
    )


def employee_status(db: Session, session: DailySession, filter_: str = "all", q: str | None = None):
    orders = {
        o.employee_id: o
        for o in db.scalars(
            select(Order).where(Order.session_id == session.id, Order.status == OrderStatus.SUBMITTED)
        )
    }
    rows: list[EmployeeStatusRow] = []
    for user in _participants(db, session.id):
        order = orders.get(user.id)
        rows.append(
            EmployeeStatusRow(
                employee_id=user.id,
                full_name=user.full_name,
                department=user.department,
                status="ORDERED" if order else "NOT_ORDERED",
                order_id=order.id if order else None,
                order_reference=order.reference if order else None,
                submitted_at=order.submitted_at if order else None,
                updated_at=order.updated_at if order else None,
                total_amount=order.total_amount if order else None,
                item_count=order.item_count if order else 0,
            )
        )
    counts = {
        "all": len(rows),
        "ordered": sum(1 for r in rows if r.status == "ORDERED"),
        "not_ordered": sum(1 for r in rows if r.status == "NOT_ORDERED"),
    }
    if filter_ == "ordered":
        rows = [r for r in rows if r.status == "ORDERED"]
    elif filter_ == "not_ordered":
        rows = [r for r in rows if r.status == "NOT_ORDERED"]
    if q:
        needle = q.strip().lower()
        rows = [r for r in rows if needle in r.full_name.lower() or needle in (r.department or "").lower()]
    return EmployeeStatusResponse(session_id=session.id, counts=counts, rows=rows)


def dashboard(db: Session, clock: Clock) -> DashboardResponse:
    now = clock.now()
    today = clock.today()
    session = session_service.session_for_date(db, today)
    if session is None:
        return DashboardResponse(
            server_time=now,
            business_date=today,
            session=None,
            metrics=None,
            recent_orders=[],
            not_ordered=[],
            seconds_until_close=None,
        )
    status = employee_status(db, session)
    ordered_rows = [r for r in status.rows if r.status == "ORDERED"]
    total_value = money(sum((r.total_amount or ZERO for r in ordered_rows), ZERO))
    total_items = sum(r.item_count for r in ordered_rows)
    participants = status.counts["all"]
    metrics = DashboardMetrics(
        total_employees=participants,
        ordered=status.counts["ordered"],
        not_ordered=status.counts["not_ordered"],
        total_items=total_items,
        total_value=total_value,
        participation_pct=round(100 * status.counts["ordered"] / participants, 1) if participants else 0.0,
    )
    recent = sorted(ordered_rows, key=lambda r: r.updated_at or r.submitted_at, reverse=True)[:6]
    seconds = None
    if session.status == SessionStatus.OPEN:
        seconds = max(0, int((session.closes_at - now).total_seconds()))
    return DashboardResponse(
        server_time=now,
        business_date=today,
        session=SessionOut.model_validate(session),
        metrics=metrics,
        recent_orders=[
            RecentOrder(
                order_id=r.order_id,
                employee_name=r.full_name,
                total_amount=r.total_amount,
                item_count=r.item_count,
                updated_at=r.updated_at or r.submitted_at,
            )
            for r in recent
        ],
        not_ordered=[
            NotOrderedEmployee(id=r.employee_id, full_name=r.full_name, department=r.department)
            for r in status.rows
            if r.status == "NOT_ORDERED"
        ],
        seconds_until_close=seconds,
    )


def _allocate_fees(subtotals: list[Decimal], fees_total: Decimal, mode: str) -> list[Decimal]:
    n = len(subtotals)
    if n == 0 or fees_total <= 0 or mode == FeeAllocation.NONE:
        return [ZERO] * n
    cents = int((fees_total * 100).to_integral_value())
    if mode == FeeAllocation.EQUAL:
        base, remainder = divmod(cents, n)
        shares = [base + (1 if i < remainder else 0) for i in range(n)]
    else:  # PROPORTIONAL to each employee's food subtotal
        grand = sum(subtotals, ZERO)
        if grand <= 0:
            return _allocate_fees(subtotals, fees_total, FeeAllocation.EQUAL)
        raw = [int((Decimal(cents) * s / grand).to_integral_value(rounding=ROUND_FLOOR)) for s in subtotals]
        leftover = cents - sum(raw)
        order = sorted(range(n), key=lambda i: subtotals[i], reverse=True)
        for i in range(leftover):
            raw[order[i % n]] += 1
        shares = raw
    return [Decimal(s) / 100 for s in shares]


def consolidated(db: Session, session: DailySession, clock: Clock) -> ConsolidatedResponse:
    orders = list(
        db.scalars(select(Order).where(Order.session_id == session.id, Order.status == OrderStatus.SUBMITTED))
    )
    orders.sort(key=lambda o: o.employee.full_name.lower())

    subtotals = [money(o.total_amount) for o in orders]
    fees_total = money(session.delivery_fee + session.service_fee)
    allocations = _allocate_fees(subtotals, fees_total, session.fee_allocation)

    by_employee: list[ConsolidatedEmployee] = []
    groups: OrderedDict[tuple[str, Decimal], dict] = OrderedDict()
    for order, allocated in zip(orders, allocations, strict=True):
        lines = []
        for item in order.items:
            modifiers = [SelectedModifierOut(**m) for m in item.selected_modifiers_snapshot]
            lines.append(
                ConsolidatedLine(
                    item_name=item.item_name_snapshot,
                    category_name=item.category_name_snapshot,
                    quantity=item.quantity,
                    unit_price=item.unit_price_snapshot,
                    modifiers=modifiers,
                    special_instructions=item.special_instructions,
                    line_total=item.line_total,
                )
            )
            key = (item.config_key, money(item.unit_price_snapshot))
            group = groups.setdefault(
                key,
                {
                    "config_key": item.config_key,
                    "item_name": item.item_name_snapshot,
                    "category_name": item.category_name_snapshot,
                    "modifiers": modifiers,
                    "unit_price": money(item.unit_price_snapshot),
                    "total_quantity": 0,
                    "total_value": ZERO,
                    "order_ids": set(),
                    "employees": [],
                },
            )
            group["total_quantity"] += item.quantity
            group["total_value"] = money(group["total_value"] + item.line_total)
            group["order_ids"].add(order.id)
            group["employees"].append(
                ConsolidatedItemEmployee(
                    full_name=order.employee.full_name,
                    quantity=item.quantity,
                    special_instructions=item.special_instructions,
                )
            )
        by_employee.append(
            ConsolidatedEmployee(
                employee_id=order.employee_id,
                full_name=order.employee.full_name,
                department=order.employee.department,
                order_reference=order.reference,
                lines=lines,
                subtotal=money(order.total_amount),
                allocated_fees=allocated,
                total=money(order.total_amount + allocated),
            )
        )

    by_item = [
        ConsolidatedItem(
            config_key=g["config_key"],
            item_name=g["item_name"],
            category_name=g["category_name"],
            modifiers=g["modifiers"],
            unit_price=g["unit_price"],
            total_quantity=g["total_quantity"],
            total_value=g["total_value"],
            order_count=len(g["order_ids"]),
            employees=g["employees"],
        )
        for g in groups.values()
    ]
    by_item.sort(key=lambda i: (i.category_name or "", i.item_name.lower(), str(i.unit_price)))

    food_subtotal = money(sum(subtotals, ZERO))
    summary = ConsolidatedSummary(
        restaurant_name=session.restaurant.name,
        restaurant_branch=session.restaurant.branch,
        restaurant_phone=session.restaurant.phone,
        order_date=session.session_date,
        session_status=session.status,
        employees_ordered=len(orders),
        meals=sum(o.item_count for o in orders),
        food_subtotal=food_subtotal,
        delivery_fee=money(session.delivery_fee),
        service_fee=money(session.service_fee),
        fees_total=fees_total,
        fee_note=session.fee_note,
        fee_allocation=session.fee_allocation,
        final_total=money(food_subtotal + fees_total),
    )
    return ConsolidatedResponse(
        session=SessionOut.model_validate(session),
        summary=summary,
        by_employee=by_employee,
        by_item=by_item,
        generated_at=clock.now(),
    )


def spending(db: Session, date_from: date, date_to: date) -> SpendingAnalytics:
    rows = db.execute(
        select(
            DailySession.session_date,
            DailySession.restaurant_id,
            func.count(Order.id),
            func.coalesce(func.sum(Order.total_amount), 0),
        )
        .join(Order, (Order.session_id == DailySession.id) & (Order.status == OrderStatus.SUBMITTED))
        .where(
            DailySession.session_date.between(date_from, date_to),
            DailySession.status != SessionStatus.CANCELLED,
        )
        .group_by(DailySession.session_date, DailySession.restaurant_id)
        .order_by(DailySession.session_date)
    ).all()
    sessions = {
        s.session_date: s
        for s in db.scalars(
            select(DailySession).where(
                DailySession.session_date.between(date_from, date_to),
                DailySession.status != SessionStatus.CANCELLED,
            )
        )
    }
    by_day = [
        SpendingPoint(
            session_date=row[0],
            restaurant_name=sessions[row[0]].restaurant.name if row[0] in sessions else "",
            orders=int(row[2]),
            total_value=money(row[3]),
        )
        for row in rows
    ]
    emp_rows = db.execute(
        select(User.id, User.full_name, func.count(Order.id), func.coalesce(func.sum(Order.total_amount), 0))
        .join(Order, Order.employee_id == User.id)
        .join(DailySession, DailySession.id == Order.session_id)
        .where(
            Order.status == OrderStatus.SUBMITTED,
            DailySession.session_date.between(date_from, date_to),
            DailySession.status != SessionStatus.CANCELLED,
        )
        .group_by(User.id, User.full_name)
        .order_by(func.sum(Order.total_amount).desc())
    ).all()
    by_employee = [
        EmployeeSpending(employee_id=r[0], full_name=r[1], orders=int(r[2]), total_value=money(r[3]))
        for r in emp_rows
    ]
    return SpendingAnalytics(
        date_from=date_from,
        date_to=date_to,
        total_value=money(sum((p.total_value for p in by_day), ZERO)),
        by_day=by_day,
        by_employee=by_employee,
    )


def participation(db: Session, date_from: date, date_to: date) -> ParticipationAnalytics:
    sessions = list(
        db.scalars(
            select(DailySession)
            .where(
                DailySession.session_date.between(date_from, date_to),
                DailySession.status != SessionStatus.CANCELLED,
                DailySession.status != SessionStatus.DRAFT,
            )
            .order_by(DailySession.session_date)
        )
    )
    points = []
    for session in sessions:
        stats = session_service.session_stats(db, session)
        rate = round(100 * stats["ordered"] / stats["participants"], 1) if stats["participants"] else 0.0
        points.append(
            ParticipationPoint(
                session_date=session.session_date,
                restaurant_name=session.restaurant.name,
                participants=stats["participants"],
                ordered=stats["ordered"],
                rate_pct=rate,
            )
        )
    average = round(sum(p.rate_pct for p in points) / len(points), 1) if points else 0.0
    return ParticipationAnalytics(
        date_from=date_from, date_to=date_to, average_rate_pct=average, by_day=points
    )
