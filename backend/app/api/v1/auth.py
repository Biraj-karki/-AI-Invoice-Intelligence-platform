from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.security import (
    create_access_token,
    hash_password,
    verify_dummy_password,
    verify_password,
)
from app.db.session import get_db
from app.models import User
from app.schemas.auth import (
    CredentialsIn,
    LoginIn,
    PasswordChangeIn,
    TokenOut,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_for(user: User) -> TokenOut:
    return TokenOut(access_token=create_access_token(str(user.id)))


@router.post(
    "/register",
    response_model=TokenOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create an account and sign in",
)
def register(payload: CredentialsIn, db: Session = Depends(get_db)) -> TokenOut:
    # Emails are compared lowercase, so "A@x.com" and "a@x.com" cannot both work.
    email = payload.email.lower()

    if db.scalar(select(User).where(User.email == email)) is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "An account with this email already exists.",
        )

    user = User(email=email, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    return _token_for(user)


@router.post("/login", response_model=TokenOut, summary="Sign in")
def login(payload: LoginIn, db: Session = Depends(get_db)) -> TokenOut:
    user = db.scalar(select(User).where(User.email == payload.email.lower()))

    if user is None:
        # Do the same work as a real verification, then fail identically, so the
        # response does not reveal whether the email exists.
        verify_dummy_password(payload.password)
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Incorrect email or password.",
        )

    if not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Incorrect email or password.",
        )

    return _token_for(user)


@router.get("/me", response_model=UserOut, summary="The signed-in account")
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.post(
    "/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Change the password of the signed-in account",
)
def change_password(
    payload: PasswordChangeIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Replace the stored password, but only for someone who knows the old one.

    The token alone is not enough: whoever finds an unlocked browser must not be
    able to lock the owner out of their own account.
    """
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Current password is incorrect.",
        )

    # Rejecting a no-op keeps the message honest ("changed") and stops someone
    # from thinking a typo was applied.
    if verify_password(payload.new_password, user.password_hash):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "The new password must be different from the current one.",
        )

    user.password_hash = hash_password(payload.new_password)
    db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)
