import uuid
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import Pagination, clock_dep, pagination, require_admin
from app.core.clock import Clock
from app.core.errors import BusinessRuleError
from app.db.session import get_db
from app.integrations.restaurant_providers.registry import all_providers
from app.models import AuditLog, OrderRevision, User
from app.schemas.admin import (
    AppSettingsOut,
    AppSettingsUpdate,
    ConsolidatedResponse,
    DashboardResponse,
    EmployeeStatusResponse,
    OcrStatus,
    ParticipationAnalytics,
    ProviderStatus,
    SessionOrdersResponse,
    SpendingAnalytics,
)
from app.schemas.common import Page
from app.schemas.order import AdminOrderCancel, AdminOrderCreate, AdminOrderUpdate, OrderOut
from app.schemas.session import SessionHistoryItem, SessionOut, SessionStats
from app.services import (
    export_service,
    order_service,
    report_service,
    session_service,
    settings_service,
)
from app.services.menu_import.ocr import ocr_availability
from app.utils.serialization import to_jsonable

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/dashboard", response_model=DashboardResponse)
def dashboard(
    db: Session = Depends(get_db), _: User = Depends(require_admin), clock: Clock = Depends(clock_dep)
):
    return report_service.dashboard(db, clock)


@router.get("/sessions/{session_id}/orders", response_model=SessionOrdersResponse)
def session_orders(
    session_id: uuid.UUID,
    include_cancelled: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    session = session_service.get_session(db, session_id)
    orders = order_service.session_orders(db, session.id, include_cancelled)
    return SessionOrdersResponse(
        session=SessionOut.model_validate(session), orders=[OrderOut.model_validate(o) for o in orders]
    )


@router.get("/sessions/{session_id}/employee-status", response_model=EmployeeStatusResponse)
def employee_status(
    session_id: uuid.UUID,
    filter: Literal["all", "ordered", "not_ordered"] = "all",
    q: str | None = Query(None, max_length=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    session = session_service.get_session(db, session_id)
    return report_service.employee_status(db, session, filter, q)


@router.get("/sessions/{session_id}/summary", response_model=SessionHistoryItem)
def session_summary(session_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    session = session_service.get_session(db, session_id)
    return SessionHistoryItem(
        **SessionOut.model_validate(session).model_dump(),
        stats=SessionStats(**session_service.session_stats(db, session)),
    )


@router.get("/sessions/{session_id}/consolidated", response_model=ConsolidatedResponse)
def consolidated(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
    clock: Clock = Depends(clock_dep),
):
    return report_service.consolidated(db, session_service.get_session(db, session_id), clock)


EXPORT_MEDIA_TYPES = {
    "pdf": "application/pdf",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "csv": "text/csv; charset=utf-8",
    "txt": "text/plain; charset=utf-8",
}


@router.get("/sessions/{session_id}/export")
def export(
    session_id: uuid.UUID,
    format: Literal["pdf", "xlsx", "csv", "txt"] = "pdf",
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
    clock: Clock = Depends(clock_dep),
):
    data = report_service.consolidated(db, session_service.get_session(db, session_id), clock)
    company = settings_service.get_app_settings(db).company_name
    if format == "pdf":
        content, filename = export_service.build_pdf(data, company)
    elif format == "xlsx":
        content, filename = export_service.build_xlsx(data, company)
    elif format == "csv":
        content, filename = export_service.build_csv(data)
    else:
        text = export_service.build_text(data, company)
        content, filename = text.encode("utf-8"), f"EMS-Food-{data.summary.order_date.isoformat()}.txt"
    return Response(
        content=content,
        media_type=EXPORT_MEDIA_TYPES[format],
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@router.post("/sessions/{session_id}/orders", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def admin_create_order(
    session_id: uuid.UUID,
    body: AdminOrderCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    clock: Clock = Depends(clock_dep),
):
    return order_service.admin_create_order(db, admin, session_id, body, clock)


@router.get("/orders/{order_id}", response_model=OrderOut)
def get_order(order_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return order_service.get_order(db, order_id)


@router.get("/orders/{order_id}/revisions")
def order_revisions(order_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    order_service.get_order(db, order_id)
    revisions = db.scalars(
        select(OrderRevision).where(OrderRevision.order_id == order_id).order_by(OrderRevision.revision_no)
    )
    actors = {u.id: u.full_name for u in db.scalars(select(User))}
    return [
        {
            "revision_no": r.revision_no,
            "action": r.action,
            "actor_name": actors.get(r.actor_user_id) if r.actor_user_id else None,
            "reason": r.reason,
            "snapshot": r.snapshot,
            "created_at": to_jsonable(r.created_at),
        }
        for r in revisions
    ]


@router.patch("/orders/{order_id}", response_model=OrderOut)
def admin_update_order(
    order_id: uuid.UUID,
    body: AdminOrderUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    clock: Clock = Depends(clock_dep),
):
    return order_service.admin_update_order(db, admin, order_id, body, clock)


@router.post("/orders/{order_id}/cancel", response_model=OrderOut)
def admin_cancel_order(
    order_id: uuid.UUID,
    body: AdminOrderCancel,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    clock: Clock = Depends(clock_dep),
):
    return order_service.admin_cancel_order(db, admin, order_id, body.reason, body.admin_override, clock)


def _range(date_from: date | None, date_to: date | None, clock: Clock) -> tuple[date, date]:
    end = date_to or clock.today()
    start = date_from or end - timedelta(days=29)
    if start > end:
        raise BusinessRuleError("The start date must be before the end date.", code="INVALID_DATE_RANGE")
    if (end - start).days > 366:
        raise BusinessRuleError("Choose a range of at most one year.", code="INVALID_DATE_RANGE")
    return start, end


@router.get("/analytics/spending", response_model=SpendingAnalytics)
def spending(
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
    clock: Clock = Depends(clock_dep),
):
    return report_service.spending(db, *_range(date_from, date_to, clock))


@router.get("/analytics/participation", response_model=ParticipationAnalytics)
def participation(
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
    clock: Clock = Depends(clock_dep),
):
    return report_service.participation(db, *_range(date_from, date_to, clock))


@router.get("/settings", response_model=AppSettingsOut)
def get_settings_(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return settings_service.get_app_settings(db)


@router.patch("/settings", response_model=AppSettingsOut)
def update_settings(
    body: AppSettingsUpdate, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    return settings_service.update_app_settings(db, admin.id, body)


@router.get("/providers", response_model=list[ProviderStatus])
def providers(_: User = Depends(require_admin)):
    return [
        ProviderStatus(
            key=p.key,
            name=p.name,
            enabled=p.is_enabled(),
            configured=p.is_enabled(),
            capabilities=list(p.capabilities),
            message=p.status_message(),
        )
        for p in all_providers()
    ]


@router.get("/ocr-status", response_model=OcrStatus)
def ocr_status(_: User = Depends(require_admin)):
    status_ = ocr_availability()
    return OcrStatus(
        available=status_.available,
        version=status_.version,
        languages=list(status_.languages),
        arabic_available=status_.arabic,
        message=status_.message,
    )


@router.get("/audit-logs", response_model=Page[dict])
def audit_logs(
    entity_type: str | None = Query(None, max_length=40),
    entity_id: str | None = Query(None, max_length=64),
    page: Pagination = Depends(pagination),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    stmt = select(AuditLog)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(db.scalars(stmt.order_by(AuditLog.created_at.desc()).limit(page.limit).offset(page.offset)))
    actors = {u.id: u.full_name for u in db.scalars(select(User))}
    items = [
        {
            "id": str(r.id),
            "actor_name": actors.get(r.actor_user_id) if r.actor_user_id else "System",
            "entity_type": r.entity_type,
            "entity_id": r.entity_id,
            "action": r.action,
            "previous_value": r.previous_value,
            "new_value": r.new_value,
            "reason": r.reason,
            "created_at": to_jsonable(r.created_at),
        }
        for r in rows
    ]
    return Page(items=items, total=total, limit=page.limit, offset=page.offset)
