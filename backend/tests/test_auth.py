from datetime import datetime, timedelta, timezone

import jwt
from sqlalchemy import select

from app.api.v1 import auth as auth_module
from app.core.config import get_settings
from app.models import User

AUTH = "/api/v1/auth"
INVOICES = "/api/v1/invoices"
PASSWORD = "correct-horse-battery"


def _register(client, email: str = "owner@example.com", password: str = PASSWORD):
    return client.post(
        f"{AUTH}/register",
        json={"email": email, "password": password},
    )


def _login(client, email: str = "owner@example.com", password: str = PASSWORD):
    return client.post(
        f"{AUTH}/login",
        json={"email": email, "password": password},
    )


def _me(client, token: str):
    return client.get(
        f"{AUTH}/me",
        headers={"Authorization": f"Bearer {token}"},
    )


def test_register_creates_an_account_and_signs_in(anonymous_client, db_session) -> None:
    response = _register(anonymous_client)

    assert response.status_code == 201
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]

    me = _me(anonymous_client, body["access_token"])
    assert me.status_code == 200
    assert me.json()["email"] == "owner@example.com"

    user = db_session.scalar(select(User).where(User.email == "owner@example.com"))
    assert user is not None


def test_password_is_stored_as_a_hash_not_as_text(anonymous_client, db_session) -> None:
    _register(anonymous_client)

    user = db_session.scalar(select(User).where(User.email == "owner@example.com"))
    assert user is not None
    assert user.password_hash != PASSWORD
    assert PASSWORD not in user.password_hash
    # Argon2id digests are recognisable and self-describing.
    assert user.password_hash.startswith("$argon2id$")


def test_register_rejects_a_duplicate_email_regardless_of_case(
    anonymous_client,
) -> None:
    assert _register(anonymous_client, email="Owner@Example.com").status_code == 201

    response = _register(anonymous_client, email="owner@example.com")

    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


def test_register_validates_email_and_password_length(anonymous_client) -> None:
    assert _register(anonymous_client, email="not-an-email").status_code == 422
    assert _register(anonymous_client, password="short").status_code == 422


def test_registration_can_be_closed(anonymous_client, db_session, monkeypatch) -> None:
    """A deployed instance must be able to refuse strangers outright."""
    closed = get_settings().model_copy(update={"allow_registration": False})
    monkeypatch.setattr(auth_module, "get_settings", lambda: closed)

    response = _register(anonymous_client)

    assert response.status_code == 403
    assert "Registration is closed" in response.json()["detail"]
    assert (
        db_session.scalar(select(User).where(User.email == "owner@example.com"))
        is None
    )


def test_login_returns_a_working_token(anonymous_client) -> None:
    _register(anonymous_client)

    response = _login(anonymous_client)

    assert response.status_code == 200
    assert _me(anonymous_client, response.json()["access_token"]).status_code == 200


def test_login_is_case_insensitive_about_the_email(anonymous_client) -> None:
    _register(anonymous_client, email="owner@example.com")

    assert _login(anonymous_client, email="OWNER@example.com").status_code == 200


def test_wrong_password_and_unknown_email_read_identically(anonymous_client) -> None:
    _register(anonymous_client)

    wrong = _login(anonymous_client, password="wrong-password")
    unknown = _login(anonymous_client, email="nobody@example.com")

    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["detail"] == unknown.json()["detail"]
    # A short password is a 401 too, not a 422 that hints at the policy.
    assert _login(anonymous_client, password="x").status_code == 401


def test_protected_routes_reject_a_missing_token(anonymous_client) -> None:
    for path in (f"{AUTH}/me", INVOICES, f"{INVOICES}/stats", f"{INVOICES}/1/file"):
        response = anonymous_client.get(path)

        assert response.status_code == 401, path
        assert response.headers["www-authenticate"] == "Bearer"


def test_protected_routes_reject_a_malformed_token(anonymous_client) -> None:
    _register(anonymous_client)

    response = _me(anonymous_client, "not-a-jwt")

    assert response.status_code == 401


def test_protected_routes_reject_an_expired_token(anonymous_client) -> None:
    _register(anonymous_client)
    settings = get_settings()
    expired = jwt.encode(
        {
            "sub": "1",
            "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )

    response = _me(anonymous_client, expired)

    assert response.status_code == 401
    assert "expired" in response.json()["detail"].lower()


def test_a_deactivated_account_loses_access(anonymous_client, db_session) -> None:
    token = _register(anonymous_client).json()["access_token"]
    assert _me(anonymous_client, token).status_code == 200

    user = db_session.scalar(select(User).where(User.email == "owner@example.com"))
    assert user is not None
    user.is_active = False
    db_session.commit()

    assert _me(anonymous_client, token).status_code == 401


def test_the_invoice_list_works_with_a_real_token(anonymous_client) -> None:
    """The override in api_client must not be hiding a broken real path."""
    token = _register(anonymous_client).json()["access_token"]

    response = anonymous_client.get(
        INVOICES,
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
