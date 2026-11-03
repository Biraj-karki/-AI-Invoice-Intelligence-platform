from app.core.config import Settings, get_settings


def test_defaults_are_usable() -> None:
    settings = Settings(_env_file=None)

    assert settings.app_name == "Invoice Intelligence API"
    assert settings.api_v1_prefix == "/api/v1"
    assert settings.environment == "local"


def test_cors_origins_are_split_and_trimmed() -> None:
    settings = Settings(
        _env_file=None,
        cors_origins=" http://localhost:3000 , http://127.0.0.1:3000,,",
    )

    assert settings.cors_origin_list == [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]


def test_get_settings_is_cached() -> None:
    assert get_settings() is get_settings()
