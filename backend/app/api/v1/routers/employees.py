import uuid
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import Pagination, clock_dep, pagination, require_admin
from app.api.v1.routers.orders import history_item
from app.core.clock import Clock
from app.db.session import get_db
from app.models import User
from app.schemas.common import Page
from app.schemas.employee import (
    EmployeeCreate,
    EmployeeCreated,
    EmployeeImportResult,
    EmployeeOut,
    EmployeeUpdate,
    PasswordResetIssue,
    PasswordResetIssued,
)
from app.schemas.order import OrderHistoryItem
from app.services import employee_service, upload_service

router = APIRouter(prefix="/employees", tags=["employees"])


@router.get("", response_model=Page[EmployeeOut])
def list_employees(
    q: str | None = Query(None, max_length=100),
    status_filter: Literal["active", "inactive", "all"] = Query("all", alias="status"),
    role: Literal["ADMIN", "EMPLOYEE"] | None = None,
    page: Pagination = Depends(pagination),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    items, total = employee_service.list_employees(db, q, status_filter, role, page.limit, page.offset)
    return Page(items=items, total=total, limit=page.limit, offset=page.offset)


@router.post("", response_model=EmployeeCreated, status_code=status.HTTP_201_CREATED)
def create_employee(
    body: EmployeeCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    user, temporary = employee_service.create_employee(db, admin, body)
    return EmployeeCreated(employee=EmployeeOut.model_validate(user), temporary_password=temporary)


@router.post("/import", response_model=EmployeeImportResult)
async def import_employees(
    file: UploadFile = File(..., description="CSV with full_name, username, email, phone, department"),
    dry_run: bool = Form(True),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    data = await upload_service.read_limited(file, 2)
    return employee_service.import_employees_csv(db, admin, data, dry_run)


@router.get("/{employee_id}", response_model=EmployeeOut)
def get_employee(employee_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return employee_service.get_employee(db, employee_id)


@router.patch("/{employee_id}", response_model=EmployeeOut)
def update_employee(
    employee_id: uuid.UUID,
    body: EmployeeUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return employee_service.update_employee(db, admin, employee_id, body)


@router.post("/{employee_id}/deactivate", response_model=EmployeeOut)
def deactivate(
    employee_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    clock: Clock = Depends(clock_dep),
):
    return employee_service.set_active(db, admin, employee_id, False, clock)


@router.post("/{employee_id}/reactivate", response_model=EmployeeOut)
def reactivate(
    employee_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    clock: Clock = Depends(clock_dep),
):
    return employee_service.set_active(db, admin, employee_id, True, clock)


@router.post("/{employee_id}/reset-password", response_model=PasswordResetIssued)
def reset_password(
    employee_id: uuid.UUID,
    body: PasswordResetIssue,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    clock: Clock = Depends(clock_dep),
):
    method, secret, expires_at = employee_service.admin_reset_password(
        db, admin, employee_id, body.method, clock
    )
    return PasswordResetIssued(method=method, secret=secret, expires_at=expires_at)


@router.get("/{employee_id}/orders", response_model=Page[OrderHistoryItem])
def employee_orders(
    employee_id: uuid.UUID,
    page: Pagination = Depends(pagination),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    orders, total = employee_service.employee_orders(db, employee_id, page.limit, page.offset)
    return Page(items=[history_item(o) for o in orders], total=total, limit=page.limit, offset=page.offset)
