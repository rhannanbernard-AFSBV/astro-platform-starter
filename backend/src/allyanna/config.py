"""Runtime settings. Database URLs come from the environment."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    database_url: str | None = None
    tax_cache_ttl_seconds: int = 300
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o"
    # Comma-separated browser origins for the thin compliance desk (Next.js).
    cors_origins: str = "http://127.0.0.1:3000,http://localhost:3000"

    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


def get_settings() -> Settings:
    return Settings()
