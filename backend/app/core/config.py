from functools import lru_cache
from pathlib import Path
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR.parent / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "EMS Food"
    app_env: Literal["development", "test", "production"] = "development"
    app_version: str = "1.0.0"
    log_level: str = "INFO"
    log_json: bool = False

    database_url: str = "postgresql+psycopg://localhost:5432/ems_food"
    db_pool_size: int = 5
    db_max_overflow: int = 10

    # Security
    jwt_secret: str = Field(default="dev-only-change-me-dev-only-change-me", min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    password_reset_code_minutes: int = 30
    login_max_failed_attempts: int = 5
    login_lockout_minutes: int = 5
    rate_limit_enabled: bool = True

    # CORS (Expo Web admin + dev servers)
    cors_origins: list[str] = ["http://localhost:8081", "http://localhost:19006"]

    # Business rules
    business_timezone: str = "Africa/Cairo"
    currency: str = "EGP"

    # Files
    media_root: Path = BACKEND_DIR / "media"
    media_url_prefix: str = "/media"
    max_image_upload_mb: int = 8
    max_menu_upload_mb: int = 20
    max_menu_pdf_pages: int = 30

    # OCR
    tesseract_cmd: str | None = None
    ocr_languages: str = "eng+ara"
    ocr_min_text_chars_per_page: int = 40

    # Notifications
    expo_push_url: str = "https://exp.host/--/api/v2/push/send"
    expo_receipts_url: str = "https://exp.host/--/api/v2/push/getReceipts"
    expo_access_token: str | None = None
    push_enabled: bool = True

    # Optional SMTP for emailed password reset codes
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    smtp_use_tls: bool = True

    # Optional authorized Talabat integration (disabled unless fully configured)
    talabat_integration_enabled: bool = False
    talabat_api_base_url: str | None = None
    talabat_client_id: str | None = None
    talabat_client_secret: str | None = None

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str) and not value.startswith("["):
            return [o.strip() for o in value.split(",") if o.strip()]
        return value

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.business_timezone)

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_from)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.is_production and settings.jwt_secret.startswith("dev-only"):
        raise RuntimeError("JWT_SECRET must be set to a strong random value in production")
    return settings
