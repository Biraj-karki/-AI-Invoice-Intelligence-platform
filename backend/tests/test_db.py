from sqlalchemy import text

from app.db.session import engine


def test_database_connection_works() -> None:
    """Proves the app can authenticate to PostgreSQL and run a query.

    This is the real integration check: no mocks, no SQLite substitute.
    """
    with engine.connect() as connection:
        result = connection.execute(text("select 1")).scalar_one()

    assert result == 1
