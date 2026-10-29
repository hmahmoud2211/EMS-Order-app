import uuid

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.db.session import get_db
from app.models import User
from app.schemas.restaurant import (
    CategoryOut,
    CategoryUpdate,
    MenuItemOut,
    MenuItemUpdate,
    ModifierGroupIn,
    ModifierGroupUpdate,
    ModifierIn,
    ModifierUpdate,
)
from app.services import menu_service

router = APIRouter(tags=["menu"])


@router.patch("/categories/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: uuid.UUID,
    body: CategoryUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    category = menu_service.update_category(db, admin, category_id, body)
    return CategoryOut(id=category.id, name=category.name, display_order=category.display_order, items=[])


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: uuid.UUID,
    archive_items: bool = Query(False),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    menu_service.delete_category(db, admin, category_id, archive_items)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/items/{item_id}", response_model=MenuItemOut)
def get_item(item_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return menu_service.get_item(db, item_id)


@router.patch("/items/{item_id}", response_model=MenuItemOut)
def update_item(
    item_id: uuid.UUID,
    body: MenuItemUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return menu_service.update_item(db, admin, item_id, body)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    menu_service.archive_item(db, admin, item_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/items/{item_id}/modifier-groups", response_model=MenuItemOut, status_code=status.HTTP_201_CREATED
)
def add_modifier_group(
    item_id: uuid.UUID,
    body: ModifierGroupIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return menu_service.add_modifier_group(db, admin, item_id, body)


@router.patch("/modifier-groups/{group_id}", response_model=MenuItemOut)
def update_modifier_group(
    group_id: uuid.UUID,
    body: ModifierGroupUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return menu_service.update_modifier_group(db, admin, group_id, body)


@router.delete("/modifier-groups/{group_id}", response_model=MenuItemOut)
def delete_modifier_group(
    group_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    return menu_service.delete_modifier_group(db, admin, group_id)


@router.post(
    "/modifier-groups/{group_id}/modifiers", response_model=MenuItemOut, status_code=status.HTTP_201_CREATED
)
def add_modifier(
    group_id: uuid.UUID, body: ModifierIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    return menu_service.add_modifier(db, admin, group_id, body)


@router.patch("/modifiers/{modifier_id}", response_model=MenuItemOut)
def update_modifier(
    modifier_id: uuid.UUID,
    body: ModifierUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return menu_service.update_modifier(db, admin, modifier_id, body)


@router.delete("/modifiers/{modifier_id}", response_model=MenuItemOut)
def delete_modifier(
    modifier_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    return menu_service.delete_modifier(db, admin, modifier_id)
