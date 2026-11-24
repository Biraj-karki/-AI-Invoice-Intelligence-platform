"""The one dependency every protected endpoint uses to identify the caller."""

from fastapi import Depends, HTTPException, status
from fastapi import Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import (
    TokenError,
    decode_access_token,
    hash_automation_token,
)
from app.db.session import get_db
from app.models import User

# auto_error=False so a missing header yields our JSON error shape rather than
# Starlette's bare 403.
_bearer = HTTPBearer(auto_error=False)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise _unauthorized("Sign in to continue.")

    try:
        subject = decode_access_token(credentials.credentials)
    except TokenError as exc:
        raise _unauthorized(str(exc)) from exc

    try:
        user_id = int(subject)
    except ValueError as exc:
        raise _unauthorized("The session token is invalid.") from exc

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise _unauthorized("This account is no longer active.")

    return user


def get_automation_user(
    automation_token: str | None = Header(
        default=None,
        alias="X-Automation-Token",
        description="Per-account token for the invoice upload automation endpoint.",
    ),
    db: Session = Depends(get_db),
) -> User:
    if automation_token is None or not automation_token.startswith("inv_auto_"):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "A valid automation token is required.",
        )

    user = db.scalar(
        select(User).where(
            User.automation_token_hash == hash_automation_token(automation_token)
        )
    )
    if user is None or not user.is_active:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "A valid automation token is required.",
        )

    return user
