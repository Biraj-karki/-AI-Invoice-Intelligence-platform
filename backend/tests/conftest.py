import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

import app.models  # noqa: F401  - registers the tables on Base.metadata
from app.core.auth import get_current_user
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import User

# Tests live in their own schema inside the development database. They never
# see the rows you created through the UI, and never touch them: asserting
# "the invoice list is empty" against a database that may hold real invoices
# would fail the moment you upload one.
TEST_SCHEMA = "pytest"

# Every invoice belongs to an account. Tests share one persisted identity, so a
# helper that builds an Invoice directly only has to say owner_id=1. Tests that
# exercise isolation create a second user of their own.
TEST_OWNER_ID = 1
TEST_OWNER_EMAIL = "scoped-owner@example.com"


@pytest.fixture(scope="session")
def test_engine():
    settings = get_settings()
    engine = create_engine(
        settings.database_url,
        connect_args={"options": f"-c search_path={TEST_SCHEMA}"},
    )

    # Start from a known-empty schema so a crashed run cannot leave stale rows.
    with engine.begin() as connection:
        connection.execute(text(f"DROP SCHEMA IF EXISTS {TEST_SCHEMA} CASCADE"))
        connection.execute(text(f"CREATE SCHEMA {TEST_SCHEMA}"))

    Base.metadata.create_all(engine)

    try:
        yield engine
    finally:
        with engine.begin() as connection:
            connection.execute(text(f"DROP SCHEMA IF EXISTS {TEST_SCHEMA} CASCADE"))
        engine.dispose()


@pytest.fixture
def db_session(test_engine):
    """A session whose commits become savepoints, rolled back after the test.

    This lets endpoint tests exercise real commit logic without leaving rows
    behind, even between tests in the same run.
    """
    connection = test_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")

    # The row is flushed, not committed; it disappears with the savepoint.
    session.add(
        User(
            id=TEST_OWNER_ID,
            email=TEST_OWNER_EMAIL,
            password_hash="not-used-by-invoice-tests",
            is_active=True,
        )
    )
    session.flush()

    # Giving the row an explicit id skips the id sequence, which would then hand
    # out 1 again to the next real registration. Move it past the seeded owner.
    session.execute(
        text("SELECT setval(pg_get_serial_sequence('users', 'id'), :last)"),
        {"last": TEST_OWNER_ID},
    )

    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def api_client(db_session):
    """A client that is already signed in.

    Individual invoice tests are about invoices, not about the token dance, so
    the identity dependency is overridden. Auth itself is exercised against
    anonymous_client in test_auth.py.
    """

    def override_get_db():
        yield db_session

    def override_current_user() -> User:
        # The identity is real (it owns the invoices these tests create), but it
        # is read from the test session instead of from a token.
        user = db_session.get(User, TEST_OWNER_ID)
        assert user is not None
        return user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_current_user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def anonymous_client(db_session):
    """A client with no identity: every protected route must reject it."""

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
