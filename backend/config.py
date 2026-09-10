from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    database_url: str
    session_secret: str
    access_token_expire_minutes: int = 30
    verification_token_expire_hours: int = 24
    password_reset_token_expire_minutes: int = 30
    frontend_url: str = "http://localhost:5000"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str = "no-reply@example.com"
    smtp_use_tls: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()


def get_database_url() -> str:
    url = get_settings().database_url
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url.removeprefix("postgres://")
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url.removeprefix("postgresql://")
    if url.startswith("postgresql+psycopg2://"):
        return "postgresql+psycopg://" + url.removeprefix("postgresql+psycopg2://")
    return url