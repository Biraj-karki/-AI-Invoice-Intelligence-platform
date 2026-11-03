from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()

# One engine per process. It owns the connection pool; do not create
# engines inside request handlers.
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,  # cheap check that a pooled connection is still alive
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: open a session per request, always close it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
