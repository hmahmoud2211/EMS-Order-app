import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class NotificationOut(ORMModel):
    id: uuid.UUID
    title: str
    message: str
    type: str
    data: dict
    is_read: bool
    created_at: datetime


class NotificationList(BaseModel):
    items: list[NotificationOut]
    total: int
    unread: int
    limit: int
    offset: int


class DeviceRegistration(BaseModel):
    token: str = Field(min_length=10, max_length=255, pattern=r"^(ExponentPushToken|ExpoPushToken)\[.+\]$")
    platform: Literal["ios", "android", "web"]
    device_name: str | None = Field(default=None, max_length=120)


class DeviceUnregister(BaseModel):
    token: str = Field(min_length=10, max_length=255)


class NotificationPrefs(BaseModel):
    session_updates: bool = True
    deadline_reminders: bool = True
    order_updates: bool = True


class NotificationPrefsUpdate(BaseModel):
    session_updates: bool | None = None
    deadline_reminders: bool | None = None
    order_updates: bool | None = None
    preferred_language: Literal["en", "ar"] | None = None
