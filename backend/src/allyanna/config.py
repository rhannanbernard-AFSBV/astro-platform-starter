"""Runtime settings. Database URLs and secrets come from the environment."""

from __future__ import annotations

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Documented local seed keys. Blocked when demo keys are not allowed.
KNOWN_DEMO_API_KEYS = frozenset({"allyanna-dev-key", "allyanna-other-key"})

_LOCAL_CORS_DEFAULTS = ("http://127.0.0.1:3000", "http://localhost:3000")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    database_url: str | None = None
    tax_cache_ttl_seconds: int = 300
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o"
    # development | staging | production
    allyanna_env: str = "development"
    # None = allow in non-production only. Production always refuses demo keys.
    allow_demo_api_keys: bool | None = None
    # Comma-separated browser origins. Empty uses local defaults outside production.
    # Production requires an explicit allowlist (no * / empty).
    cors_origins: str = ""

    @field_validator("allyanna_env", mode="before")
    @classmethod
    def _normalize_env(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().lower()
        return value

    def is_production(self) -> bool:
        return self.allyanna_env in {"production", "prod"}

    def demo_keys_allowed(self) -> bool:
        if self.is_production():
            return False
        if self.allow_demo_api_keys is None:
            return True
        return self.allow_demo_api_keys

    def cors_origin_list(self) -> list[str]:
        raw = self.cors_origins.strip()
        if not raw:
            if self.is_production():
                return []
            return list(_LOCAL_CORS_DEFAULTS)
        origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
        return origins

    @model_validator(mode="after")
    def _reject_insecure_production_cors(self) -> Settings:
        if not self.is_production():
            return self
        origins = self.cors_origin_list()
        if not origins:
            raise ValueError(
                "ALLYANNA_ENV=production requires CORS_ORIGINS set to explicit desk origin(s)"
            )
        if any(origin == "*" for origin in origins):
            raise ValueError("CORS_ORIGINS must not include '*' in production")
        return self


def get_settings() -> Settings:
    return Settings()


def validate_production_secrets(settings: Settings) -> None:
    """Fail fast for live/staging-tagged production deploys. Does not invent secrets."""
    if not settings.is_production():
        return
    missing: list[str] = []
    if not settings.database_url:
        missing.append("DATABASE_URL")
    if not (settings.openai_api_key and settings.openai_api_key.strip()):
        missing.append("OPENAI_API_KEY")
    if missing:
        raise RuntimeError(
            "Production Allyanna requires user-supplied secrets: " + ", ".join(missing)
        )
    if settings.demo_keys_allowed():
        raise RuntimeError("Production must not allow demo API keys")
    if not settings.cors_origin_list():
        raise RuntimeError("Production requires CORS_ORIGINS allowlist")
