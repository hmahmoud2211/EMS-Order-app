import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import AppSetting
from app.schemas.admin import AppSettingsOut, AppSettingsUpdate
from app.services import audit_service

SETTINGS_KEY = "company"

DEFAULTS: dict[str, Any] = {
    "company_name": "Engineering Management Systems",
    "allow_employee_cancellation": True,
    "default_opens_at": "09:00",
    "default_closes_at": "12:00",
    "reminder_minutes_before_deadline": 30,
    "default_fee_allocation": "NONE",
}


def get_app_settings(db: Session) -> AppSettingsOut:
    row = db.scalar(select(AppSetting).where(AppSetting.key == SETTINGS_KEY))
    merged = {**DEFAULTS, **(row.value if row else {})}
    return AppSettingsOut(**merged, currency=get_settings().currency)


def update_app_settings(db: Session, actor_id: uuid.UUID, data: AppSettingsUpdate) -> AppSettingsOut:
    row = db.scalar(select(AppSetting).where(AppSetting.key == SETTINGS_KEY).with_for_update())
    previous = {**DEFAULTS, **(row.value if row else {})}
    changes = data.model_dump(exclude_unset=True, exclude_none=True, mode="json")
    new_value = {**previous, **changes}
    if row is None:
        db.add(AppSetting(key=SETTINGS_KEY, value=new_value, updated_by=actor_id))
    else:
        row.value = new_value
        row.updated_by = actor_id
    audit_service.record(
        db,
        actor_id=actor_id,
        entity_type="settings",
        entity_id=SETTINGS_KEY,
        action="SETTINGS_UPDATED",
        previous=previous,
        new=new_value,
    )
    db.commit()
    return get_app_settings(db)
