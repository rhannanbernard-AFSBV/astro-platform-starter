"""Runtime settings. Database URLs come from the environment."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    database_url: str | None = None
    tax_cache_ttl_seconds: int = 300
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o"


def get_settings() -> Settings:
    return Settings()
