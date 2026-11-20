from sqlalchemy import select

from app.models import User

AUTH = "/api/v1/auth"
CURRENT = "correct-horse-battery"
NEW = "battery-staple-correct"


def _register(client, password: str = CURRENT):
    return client.post(
        f"{AUTH}/register",
        json={"email": "owner@example.com", "password": password},
    )


def _change(client, token: str, *, current: str = CURRENT, new: str = NEW):
    return client.post(
        f"{AUTH}/change-password",
        json={"current_password": current, "new_password": new},
        headers={"Authorization": f"Bearer {token}"},
    )


def _login(client, password: str, email: str = "owner@example.com"):
    return client.post(
        f"{AUTH}/login",
        json={"email": email, "password": password},
    )


def test_changing_the_password_swaps_which_one_works(anonymous_client) -> None:
    token = _register(anonymous_client).json()["access_token"]

    response = _change(anonymous_client, token)

    assert response.status_code == 204
    assert response.content == b""
    # The new password works from now on; the old one is gone.
    assert _login(anonymous_client, NEW).status_code == 200
    assert _login(anonymous_client, CURRENT).status_code == 401


def test_the_new_password_is_hashed_and_never_stored_as_text(
    anonymous_client, db_session
) -> None:
    token = _register(anonymous_client).json()["access_token"]

    _change(anonymous_client, token)

    user = db_session.scalar(select(User).where(User.email == "owner@example.com"))
    assert user is not None
    assert NEW not in user.password_hash
    assert user.password_hash.startswith("$argon2id$")


def test_a_wrong_current_password_changes_nothing(anonymous_client, db_session) -> None:
    token = _register(anonymous_client).json()["access_token"]

    response = _change(anonymous_client, token, current="not-my-password")

    assert response.status_code == 400
    assert response.json()["detail"] == "Current password is incorrect."
    assert _login(anonymous_client, CURRENT).status_code == 200
    assert _login(anonymous_client, NEW).status_code == 401


def test_repeating_the_current_password_is_rejected(anonymous_client) -> None:
    token = _register(anonymous_client).json()["access_token"]

    response = _change(anonymous_client, token, new=CURRENT)

    assert response.status_code == 400
    assert "different" in response.json()["detail"]
    assert _login(anonymous_client, CURRENT).status_code == 200


def test_a_short_new_password_is_a_validation_error(anonymous_client) -> None:
    token = _register(anonymous_client).json()["access_token"]

    assert _change(anonymous_client, token, new="short").status_code == 422
    # The refused request must not have touched the stored password.
    assert _login(anonymous_client, CURRENT).status_code == 200


def test_changing_the_password_requires_a_token(anonymous_client) -> None:
    _register(anonymous_client)

    response = anonymous_client.post(
        f"{AUTH}/change-password",
        json={"current_password": CURRENT, "new_password": NEW},
    )

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_the_session_survives_a_password_change(anonymous_client) -> None:
    """The person who just proved they know the old password stays signed in."""
    token = _register(anonymous_client).json()["access_token"]

    _change(anonymous_client, token)

    me = anonymous_client.get(
        f"{AUTH}/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me.status_code == 200
