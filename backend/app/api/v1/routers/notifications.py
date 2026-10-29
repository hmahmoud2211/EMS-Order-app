import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import Pagination, get_current_user, pagination
from app.db.session import get_db
from app.models import User
from app.models.user import DEFAULT_NOTIFICATION_PREFS
from app.schemas.notification import (
    DeviceRegistration,
    DeviceUnregister,
    NotificationList,
    NotificationOut,
    NotificationPrefs,
    NotificationPrefsUpdate,
)
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationList)
def list_notifications(
    unread_only: bool = False,
    page: Pagination = Depends(pagination),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items, total, unread = notification_service.list_for_user(db, user, page.limit, page.offset, unread_only)
    return NotificationList(items=items, total=total, unread=unread, limit=page.limit, offset=page.offset)


@router.patch("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def read_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    notification_service.mark_all_read(db, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return notification_service.mark_read(db, user, notification_id)


@router.post("/register-device", status_code=status.HTTP_204_NO_CONTENT)
def register_device(
    body: DeviceRegistration, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    notification_service.register_device(db, user, body.token, body.platform, body.device_name)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/unregister-device", status_code=status.HTTP_204_NO_CONTENT)
def unregister_device(
    body: DeviceUnregister, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    notification_service.unregister_device(db, user, body.token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/preferences", response_model=NotificationPrefs)
def get_preferences(user: User = Depends(get_current_user)):
    return NotificationPrefs(**{**DEFAULT_NOTIFICATION_PREFS, **(user.notification_prefs or {})})


@router.patch("/preferences", response_model=NotificationPrefs)
def update_preferences(
    body: NotificationPrefsUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    language = changes.pop("preferred_language", None)
    user.notification_prefs = {**DEFAULT_NOTIFICATION_PREFS, **(user.notification_prefs or {}), **changes}
    if language:
        user.preferred_language = language
    db.commit()
    return NotificationPrefs(**user.notification_prefs)
