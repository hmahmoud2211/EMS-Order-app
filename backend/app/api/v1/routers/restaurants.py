import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import Pagination, clock_dep, pagination, require_admin
from app.core.clock import Clock
from app.core.config import get_settings
from app.core.errors import ConflictError
from app.db.session import get_db
from app.integrations.restaurant_providers.base import ProviderNotConfigured
from app.integrations.restaurant_providers.registry import get_provider
from app.models import User
from app.schemas.common import Page
from app.schemas.menu_import import ImportApprove, ImportDraftUpdate, MenuImportDetail, MenuImportOut
from app.schemas.restaurant import (
    CategoryCreate,
    CategoryOut,
    MenuItemCreate,
    MenuItemOut,
    MenuOut,
    RestaurantCreate,
    RestaurantListItem,
    RestaurantOut,
    RestaurantUpdate,
)
from app.services import menu_service, restaurant_service, upload_service
from app.services.menu_import import pipeline

router = APIRouter(prefix="/restaurants", tags=["restaurants"])


@router.get("", response_model=Page[RestaurantListItem])
def list_restaurants(
    q: str | None = Query(None, max_length=100),
    active: bool | None = None,
    page: Pagination = Depends(pagination),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    items, total = restaurant_service.list_restaurants(db, q, active, page.limit, page.offset)
    return Page(items=items, total=total, limit=page.limit, offset=page.offset)


@router.post("", response_model=RestaurantOut, status_code=status.HTTP_201_CREATED)
def create_restaurant(
    body: RestaurantCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    return restaurant_service.create_restaurant(db, admin, body)


@router.get("/{restaurant_id}", response_model=RestaurantOut)
def get_restaurant(restaurant_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return restaurant_service.get_restaurant(db, restaurant_id)


@router.patch("/{restaurant_id}", response_model=RestaurantOut)
def update_restaurant(
    restaurant_id: uuid.UUID,
    body: RestaurantUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return restaurant_service.update_restaurant(db, admin, restaurant_id, body)


@router.get("/{restaurant_id}/menu", response_model=MenuOut)
def get_menu(restaurant_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return restaurant_service.load_menu(db, restaurant_service.get_restaurant(db, restaurant_id))


@router.post("/{restaurant_id}/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(
    restaurant_id: uuid.UUID,
    body: CategoryCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    category = menu_service.create_category(db, admin, restaurant_id, body)
    return CategoryOut(id=category.id, name=category.name, display_order=category.display_order, items=[])


@router.post("/{restaurant_id}/items", response_model=MenuItemOut, status_code=status.HTTP_201_CREATED)
def create_item(
    restaurant_id: uuid.UUID,
    body: MenuItemCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return menu_service.create_item(db, admin, restaurant_id, body)


# ---- Menu imports ----------------------------------------------------------------


@router.post(
    "/{restaurant_id}/menu/import", response_model=MenuImportOut, status_code=status.HTTP_202_ACCEPTED
)
async def import_menu(
    restaurant_id: uuid.UUID,
    background: BackgroundTasks,
    file: UploadFile = File(..., description="PDF, JPG, PNG, WEBP, CSV or XLSX"),
    force: bool = Form(False),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    data = await upload_service.read_limited(file, get_settings().max_menu_upload_mb)
    record = pipeline.create_import(db, admin, restaurant_id, data, file.filename or "menu", force)
    background.add_task(pipeline.process_import, record.id)
    return record


@router.get("/{restaurant_id}/menu/imports", response_model=list[MenuImportOut])
def list_imports(restaurant_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return pipeline.list_imports(db, restaurant_id)


@router.get("/{restaurant_id}/menu/imports/{import_id}", response_model=MenuImportDetail)
def get_import(
    restaurant_id: uuid.UUID,
    import_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return pipeline.get_import(db, restaurant_id, import_id)


@router.patch("/{restaurant_id}/menu/imports/{import_id}", response_model=MenuImportDetail)
def update_import(
    restaurant_id: uuid.UUID,
    import_id: uuid.UUID,
    body: ImportDraftUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return pipeline.update_draft(db, admin, restaurant_id, import_id, body.items)


@router.post("/{restaurant_id}/menu/imports/{import_id}/approve", response_model=MenuImportDetail)
def approve_import(
    restaurant_id: uuid.UUID,
    import_id: uuid.UUID,
    body: ImportApprove,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    clock: Clock = Depends(clock_dep),
):
    return pipeline.approve_import(
        db, admin, restaurant_id, import_id, body.mode, body.confirm_replace, clock
    )


@router.post("/{restaurant_id}/menu/imports/{import_id}/reject", response_model=MenuImportOut)
def reject_import(
    restaurant_id: uuid.UUID,
    import_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return pipeline.reject_import(db, admin, restaurant_id, import_id)


@router.post("/{restaurant_id}/menu/refresh", response_model=MenuImportOut)
def refresh_menu(restaurant_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Synchronize a menu from an external provider (only for authorized, configured providers)."""
    restaurant = restaurant_service.get_restaurant(db, restaurant_id)
    if restaurant.source_provider != "TALABAT":
        raise ConflictError(
            "This restaurant's menu is managed manually or by file import. Use Import Menu to update it.",
            code="PROVIDER_NOT_SUPPORTED",
        )
    try:
        get_provider("talabat").fetch_menu(restaurant)
    except ProviderNotConfigured as exc:
        raise ConflictError(exc.message, code="PROVIDER_NOT_CONFIGURED") from exc
    raise ConflictError("Provider synchronization is not implemented.", code="PROVIDER_NOT_CONFIGURED")
