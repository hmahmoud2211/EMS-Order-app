import uuid

from fastapi import APIRouter, Body, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import Pagination, clock_dep, get_current_user, pagination, require_admin
from app.core.clock import Clock
from app.core.errors import NotFoundError
from app.db.session import get_db
from app.models import DailySession, User
from app.models.enums import SessionStatus
from app.schemas.common import Page
from app.schemas.restaurant import MenuOut
from app.schemas.session import (
    MyOrderSummary,
    SessionCancelRequest,
    SessionCreate,
    SessionHistoryItem,
    SessionOpenRequest,
    SessionOut,
    SessionStats,
    SessionUpdate,
    TodayResponse,
)
from app.services import order_service, restaurant_service, session_service, settings_service

router = APIRouter(prefix="/sessions", tags=["sessions"])

EMPLOYEE_VISIBLE = {SessionStatus.OPEN, SessionStatus.CLOSED, SessionStatus.FINALIZED}


def visible_today_session(db: Session, user: User, clock: Clock) -> DailySession | None:
    session = session_service.session_for_date(db, clock.today())
    if session is None:
        return None
    if not user.is_admin and session.status not in EMPLOYEE_VISIBLE:
        return None
    return session


@router.get("/today", response_model=TodayResponse)
def today(
    user: User = Depends(get_current_user), db: Session = Depends(get_db), clock: Clock = Depends(clock_dep)
):
    session = visible_today_session(db, user, clock)
    accepting, reason = session_service.accepting_state(session, clock)
    my_order = None
    if session is not None:
        order = order_service.active_order_for(db, session.id, user.id)
        if order is not None:
            my_order = MyOrderSummary(
                id=order.id,
                reference=order.reference,
                status=order.status,
                total_amount=order.total_amount,
                item_count=order.item_count,
                submitted_at=order.submitted_at,
                updated_at=order.updated_at,
            )
    settings = settings_service.get_app_settings(db)
    return TodayResponse(
        server_time=clock.now(),
        business_date=clock.today(),
        session=SessionOut.model_validate(session) if session else None,
        is_accepting_orders=accepting and user.participates_in_orders,
        accepting_reason=reason if user.participates_in_orders else "NOT_A_PARTICIPANT",
        can_cancel_order=bool(accepting and settings.allow_employee_cancellation and my_order),
        my_order=my_order,
    )


@router.get("/today/menu", response_model=MenuOut)
def today_menu(
    user: User = Depends(get_current_user), db: Session = Depends(get_db), clock: Clock = Depends(clock_dep)
):
    """Menu of the restaurant selected for today. Employees cannot browse any other restaurant."""
    session = visible_today_session(db, user, clock)
    if session is None:
        raise NotFoundError("No restaurant has been selected for today yet.", code="NO_SESSION")
    menu = restaurant_service.load_menu(db, session.restaurant)
    if menu.item_count == 0:
        raise NotFoundError("Today's restaurant menu is not available yet.", code="MENU_UNAVAILABLE")
    return menu


@router.post("", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    body: SessionCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    clock: Clock = Depends(clock_dep),
):
    return session_service.create_session(db, admin, body, clock)


@router.get("/history", response_model=Page[SessionHistoryItem])
def history(
    status_filter: SessionStatus | None = Query(None, alias="status"),
    page: Pagination = Depends(pagination),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    sessions, total = session_service.history(db, page.limit, page.offset, status_filter)
    items = [
        SessionHistoryItem(
            **SessionOut.model_validate(s).model_dump(),
            stats=SessionStats(**session_service.session_stats(db, s)),
        )
        for s in sessions
    ]
    return Page(items=items, total=total, limit=page.limit, offset=page.offset)


@router.get("/{session_id}", response_model=SessionOut)
def get_session(session_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return session_service.get_session(db, session_id)


@router.patch("/{session_id}", response_model=SessionOut)
def update_session(
    session_id: uuid.UUID,
    body: SessionUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    clock: Clock = Depends(clock_dep),
):
    return session_service.update_session(db, admin, session_id, body, clock)


@router.post("/{session_id}/open", response_model=SessionOut)
def open_session(
    session_id: uuid.UUID,
    body: SessionOpenRequest | None = Body(default=None),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    clock: Clock = Depends(clock_dep),
):
    return session_service.open_session(db, admin, session_id, body.closes_at if body else None, clock)


@router.post("/{session_id}/close", response_model=SessionOut)
def close_session(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    clock: Clock = Depends(clock_dep),
):
    return session_service.close_session(db, admin, session_id, clock)


@router.post("/{session_id}/finalize", response_model=SessionOut)
def finalize_session(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    clock: Clock = Depends(clock_dep),
):
    return session_service.finalize_session(db, admin, session_id, clock)


@router.post("/{session_id}/cancel", response_model=SessionOut)
def cancel_session(
    session_id: uuid.UUID,
    body: SessionCancelRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    clock: Clock = Depends(clock_dep),
):
    return session_service.cancel_session(db, admin, session_id, body.reason, clock)
