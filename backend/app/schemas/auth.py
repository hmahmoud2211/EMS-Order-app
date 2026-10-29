import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=254, description="Username or email")
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=20, max_length=200)


class LogoutRequest(BaseModel):
    refresh_token: str | None = Field(default=None, max_length=200)
    push_token: str | None = Field(default=None, max_length=255)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class PasswordResetRequest(BaseModel):
    username: str = Field(min_length=1, max_length=254)


class PasswordResetConfirm(BaseModel):
    username: str = Field(min_length=1, max_length=254)
    code: str = Field(min_length=6, max_length=20)
    new_password: str = Field(min_length=8, max_length=128)


class CurrentUser(ORMModel):
    id: uuid.UUID
    full_name: str
    username: str
    email: str | None
    phone: str | None
    department: str | None
    role: str
    is_active: bool
    participates_in_orders: bool
    must_change_password: bool
    last_login_at: datetime | None
    notification_prefs: dict
    preferred_language: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    access_token_expires_at: datetime


class LoginResponse(TokenPair):
    user: CurrentUser
