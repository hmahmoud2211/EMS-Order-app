from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import clock_dep, get_authenticated_user
from app.core.clock import Clock
from app.core.ratelimit import limiter
from app.db.session import get_db
from app.models import User
from app.schemas.auth import (
    ChangePasswordRequest,
    CurrentUser,
    LoginRequest,
    LoginResponse,
    LogoutRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshRequest,
    TokenPair,
)
from app.schemas.common import Message
from app.services import auth_service, notification_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _ua(request: Request) -> str | None:
    return request.headers.get("user-agent")


@router.post("/login", response_model=LoginResponse)
@limiter.limit("10/minute")
def login(
    request: Request, body: LoginRequest, db: Session = Depends(get_db), clock: Clock = Depends(clock_dep)
):
    return auth_service.login(db, body.username, body.password, clock, _ua(request))


@router.post("/refresh", response_model=TokenPair)
@limiter.limit("30/minute")
def refresh(
    request: Request, body: RefreshRequest, db: Session = Depends(get_db), clock: Clock = Depends(clock_dep)
):
    return auth_service.refresh(db, body.refresh_token, clock, _ua(request))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    body: LogoutRequest,
    user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
    clock: Clock = Depends(clock_dep),
):
    if body.push_token:
        notification_service.unregister_device(db, user, body.push_token)
    auth_service.logout(db, user, body.refresh_token, clock)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=CurrentUser)
def me(user: User = Depends(get_authenticated_user)):
    return user


@router.post("/change-password", response_model=TokenPair)
def change_password(
    request: Request,
    body: ChangePasswordRequest,
    user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
    clock: Clock = Depends(clock_dep),
):
    return auth_service.change_password(
        db, user, body.current_password, body.new_password, clock, _ua(request)
    )


@router.post("/request-password-reset", response_model=Message, status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/minute")
def request_password_reset(
    request: Request,
    body: PasswordResetRequest,
    db: Session = Depends(get_db),
    clock: Clock = Depends(clock_dep),
):
    auth_service.request_password_reset(db, body.username, clock)
    return Message(
        message="If the account exists, your administrator has been notified. "
        "Ask them for a reset code, then enter it on the next screen."
    )


@router.post("/reset-password", response_model=Message)
@limiter.limit("10/minute")
def reset_password(
    request: Request,
    body: PasswordResetConfirm,
    db: Session = Depends(get_db),
    clock: Clock = Depends(clock_dep),
):
    auth_service.reset_password(db, body.username, body.code, body.new_password, clock)
    return Message(message="Your password has been reset. You can sign in now.")
