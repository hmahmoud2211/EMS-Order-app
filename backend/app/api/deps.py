import uuid
from dataclasses import dataclass

import jwt
from fastapi import Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.clock import Clock, get_clock
from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import User

bearer = HTTPBearer(auto_error=False)


def clock_dep() -> Clock:
    return get_clock()


def get_authenticated_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    """Any valid, active account — including one that must still change its password."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise UnauthorizedError("Please sign in to continue.", code="NOT_AUTHENTICATED")
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = uuid.UUID(payload["sub"])
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("Your session has expired.", code="TOKEN_EXPIRED") from exc
    except (jwt.InvalidTokenError, ValueError, KeyError) as exc:
        raise UnauthorizedError("Invalid authentication token.", code="INVALID_TOKEN") from exc
    user = db.get(User, user_id)
    if user is None:
        raise UnauthorizedError("Invalid authentication token.", code="INVALID_TOKEN")
    if not user.is_active:
        raise UnauthorizedError(
            "This account has been deactivated. Please contact your administrator.", code="ACCOUNT_DISABLED"
        )
    return user


def get_current_user(user: User = Depends(get_authenticated_user)) -> User:
    if user.must_change_password:
        raise ForbiddenError(
            "Please change your password before continuing.", code="PASSWORD_CHANGE_REQUIRED"
        )
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise ForbiddenError("This action requires administrator access.", code="ADMIN_REQUIRED")
    return user


@dataclass
class Pagination:
    limit: int
    offset: int


def pagination(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0, le=100_000)) -> Pagination:
    return Pagination(limit=limit, offset=offset)
