import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.enums import UserRole
from app.schemas.common import ORMModel

USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,59}$")


def _normalize_username(value: str) -> str:
    value = value.strip().lower()
    if not USERNAME_RE.match(value):
        raise ValueError(
            "Username must be 3–60 characters: lowercase letters, digits, dot, dash or underscore."
        )
    return value


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


class EmployeeBase(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=30)
    department: str | None = Field(default=None, max_length=80)

    @field_validator("full_name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 2:
            raise ValueError("Full name is required.")
        return v

    @field_validator("phone", "department", mode="before")
    @classmethod
    def _blank(cls, v: str | None) -> str | None:
        return _blank_to_none(v)

    @field_validator("email", mode="before")
    @classmethod
    def _blank_email(cls, v: str | None) -> str | None:
        v = _blank_to_none(v)
        return v.lower() if v else v


class EmployeeCreate(EmployeeBase):
    username: str
    role: UserRole = UserRole.EMPLOYEE
    password: str | None = Field(default=None, min_length=8, max_length=128)
    participates_in_orders: bool | None = None

    @field_validator("username")
    @classmethod
    def _username(cls, v: str) -> str:
        return _normalize_username(v)


class EmployeeUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    username: str | None = None
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=30)
    department: str | None = Field(default=None, max_length=80)
    role: UserRole | None = None
    participates_in_orders: bool | None = None

    @field_validator("username")
    @classmethod
    def _username(cls, v: str | None) -> str | None:
        return _normalize_username(v) if v is not None else None

    @field_validator("phone", "department", mode="before")
    @classmethod
    def _blank(cls, v: str | None) -> str | None:
        return _blank_to_none(v)

    @field_validator("email", mode="before")
    @classmethod
    def _blank_email(cls, v: str | None) -> str | None:
        v = _blank_to_none(v)
        return v.lower() if v else v


class EmployeeOut(ORMModel):
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
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None


class EmployeeCreated(BaseModel):
    employee: EmployeeOut
    temporary_password: str | None = Field(
        default=None, description="Shown once. Share it privately with the employee."
    )


class PasswordResetIssue(BaseModel):
    method: Literal["code", "temporary_password"] = "code"


class PasswordResetIssued(BaseModel):
    method: Literal["code", "temporary_password"]
    secret: str
    expires_at: datetime | None = None


class EmployeeImportRow(BaseModel):
    row: int
    full_name: str | None
    username: str | None
    email: str | None
    phone: str | None
    department: str | None
    errors: list[str]


class EmployeeImportCredential(BaseModel):
    full_name: str
    username: str
    temporary_password: str


class EmployeeImportResult(BaseModel):
    dry_run: bool
    total_rows: int
    valid_rows: int
    rows: list[EmployeeImportRow]
    created: list[EmployeeImportCredential] = []
