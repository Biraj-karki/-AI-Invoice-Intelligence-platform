"""Password hashing and JWT access tokens.

One module owns both, so the rules (which algorithm, how long a token lives)
are defined once and the API layer never touches a secret directly.
"""

from datetime import datetime, timedelta, timezone

import jwt
from pwdlib import PasswordHash

from app.core.config import get_settings

settings = get_settings()

# Argon2id by default: memory-hard, so a stolen hash is expensive to crack.
_password_hash = PasswordHash.recommended()

# Verifying against a dummy hash when the email is unknown keeps the "user not
# found" path roughly as slow as "wrong password", so response time does not
# reveal which emails have accounts.
_DUMMY_HASH = _password_hash.hash("not-a-real-password")


class TokenError(Exception):
    """The token is missing, malformed, expired or signed with another key."""


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _password_hash.verify(password, password_hash)
    except Exception:
        # A corrupt or foreign hash must read as "wrong password", not a 500.
        return False


def verify_dummy_password(password: str) -> None:
    """Burn the same time as a real check when no account exists."""
    _password_hash.verify(password, _DUMMY_HASH)


def create_access_token(subject: str) -> str:
    """Sign a short-lived token whose subject is the user id."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> str:
    """Return the subject, or raise TokenError. Never returns unverified data."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.PyJWTError as exc:
        raise TokenError("The session token is invalid or has expired.") from exc

    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject:
        raise TokenError("The session token is missing its subject.")

    return subject
