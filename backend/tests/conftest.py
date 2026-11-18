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
        # A transient object: invoice endpoints never read it.
        return User(
            id=1,
            email="test@example.com",
            password_hash="not-used-by-invoice-tests",
            is_active=True,
        )

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
