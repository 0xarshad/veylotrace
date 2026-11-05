from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    app_env: str = "development"  # development | production | test
    database_url: str = f"sqlite:///{BASE_DIR / 'data' / 'veylotrace.db'}"

    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "veylotrace"
    jwt_audience: str = "veylotrace-web"
    access_token_minutes: int = 15
    refresh_token_days: int = 14
    session_absolute_days: int = 60

    encryption_key: str = ""  # Fernet key (urlsafe base64, 32 bytes)

    cors_origins: str = "http://localhost:5173"
    frontend_url: str = "http://localhost:5173"
    cookie_secure: bool = False
    cookie_samesite: str = "strict"

    email_backend: str = "file"  # file | smtp | memory
    email_from: str = "VeyloTrace <no-reply@localhost>"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    outbox_dir: str = str(BASE_DIR / "data" / "outbox")
    # None (default) = require verification only when a real mail backend (smtp) is configured.
    require_email_verification: bool | None = None

    login_rate_limit: int = 5
    login_rate_window_seconds: int = 300
    general_rate_limit_per_minute: int = 600

    backup_dir: str = str(BASE_DIR / "data" / "backups")
    backup_retention: int = 14
    auto_backup_hours: int = 0  # 0 disables scheduled backups
    backup_passphrase: str = ""  # optional: encrypt backups at rest

    ai_request_timeout_seconds: int = 60
    groq_api_key: str = ""  # Optional installer-provided key, copied into a user config only on explicit setup.

    @field_validator("cookie_samesite")
    @classmethod
    def _samesite(cls, v: str) -> str:
        v = v.lower()
        if v not in {"strict", "lax", "none"}:
            raise ValueError("cookie_samesite must be strict, lax or none")
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def verification_required(self) -> bool:
        if self.require_email_verification is not None:
            return self.require_email_verification
        return self.email_backend == "smtp"

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    def validate_secrets(self) -> None:
        if len(self.jwt_secret) < 32:
            raise RuntimeError(
                "JWT_SECRET must be set to a random value of at least 32 characters "
                "(run `python scripts/init_env.py`)."
            )
        if not self.encryption_key:
            raise RuntimeError("ENCRYPTION_KEY must be set (run `python scripts/init_env.py`).")
        if self.jwt_algorithm not in {"HS256", "HS384", "HS512"}:
            raise RuntimeError("JWT_ALGORITHM must be HS256, HS384 or HS512.")
        if self.is_production and not self.cookie_secure:
            raise RuntimeError("COOKIE_SECURE must be true in production.")


@lru_cache
def get_settings() -> Settings:
    return Settings()
