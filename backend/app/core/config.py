from functools import lru_cache
from pathlib import Path

from pydantic import field_validator, model_validator
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
    cloudinary_url: str = ""

    # Auth. The default secret only keeps local development working; set
    # JWT_SECRET in .env before exposing this API anywhere real.
    jwt_secret: str = "dev-only-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60 * 24  # one day

    # Open registration is convenient while building and a liability once the
    # app is online. Set ALLOW_REGISTRATION=false when your own account exists:
    # new accounts then have to be created by an operator, not by a stranger.
    allow_registration: bool = True

    # Never commit this. Empty by default so the app can start without AI features.
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.6-flash"
    # Comma-separated; tried in order when the primary model is overloaded.
    gemini_fallback_models: str = "gemini-3.8-flash,gemini-3.5-flash-lite"
    gemini_timeout_seconds: float = 90.0

    @field_validator("database_url", mode="before")
    @classmethod
    def _use_psycopg_driver(cls, value: object) -> object:
        if isinstance(value, str):
            if value.startswith("postgres://"):
                return "postgresql+psycopg://" + value.removeprefix("postgres://")
            if value.startswith("postgresql://"):
                return "postgresql+psycopg://" + value.removeprefix("postgresql://")
        return value

    @model_validator(mode="after")
    def _require_cloud_storage_in_production(self) -> "Settings":
        if self.environment == "production" and not self.cloudinary_url:
            raise ValueError("CLOUDINARY_URL is required when ENVIRONMENT=production.")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        """Split CORS_ORIGINS on commas, trimming blanks."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def gemini_fallback_list(self) -> list[str]:
        """Split GEMINI_FALLBACK_MODELS on commas, trimming blanks."""
        return [
            model.strip()
            for model in self.gemini_fallback_models.split(",")
            if model.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    """Cached accessor so the .env file is read only once per process."""
    return Settings()
