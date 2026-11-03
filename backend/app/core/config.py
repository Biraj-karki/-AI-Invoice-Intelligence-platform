from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/core/config.py -> backend/
BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Application settings, read from environment variables or backend/.env.

    Field names are case-insensitive, so `database_url` is filled by
    either `DATABASE_URL` in .env or a DATABASE_URL environment variable.
    """

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Invoice Intelligence API"
    app_version: str = "0.1.0"
    api_v1_prefix: str = "/api/v1"
    environment: str = "local"

    # Kept as a plain string because .env cannot hold a Python list.
    # Use `cors_origin_list` everywhere in code.
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Not used until the database step; declared here so there is one config home.
    database_url: str = (
        "postgresql+psycopg://invoice_user:invoice_dev_pw@127.0.0.1:5432/invoice_db"
    )

    # Relative to backend/ ; uploaded PDFs land in <storage_dir>/uploads (gitignored).
    storage_dir: str = "storage"

    # Never commit this. Empty by default so the app can start without AI features.
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"
    gemini_timeout_seconds: float = 60.0

    @property
    def cors_origin_list(self) -> list[str]:
        """Split CORS_ORIGINS on commas, trimming blanks."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Cached accessor so the .env file is read only once per process."""
    return Settings()
