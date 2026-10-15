"""Production go-live guards: secrets, CORS allowlist, demo key block."""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from allyanna.config import KNOWN_DEMO_API_KEYS, Settings, validate_production_secrets
from allyanna.main import create_app


def test_production_disallows_known_demo_key_plaintext(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ALLYANNA_ENV", "production")
    monkeypatch.setenv("CORS_ORIGINS", "https://desk.example.com")
    settings = Settings()
    assert settings.demo_keys_allowed() is False
    assert "allyanna-dev-key" in KNOWN_DEMO_API_KEYS
    assert "allyanna-other-key" in KNOWN_DEMO_API_KEYS


def test_local_defaults_allow_demo_keys_and_local_cors(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ALLYANNA_ENV", raising=False)
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    monkeypatch.delenv("ALLOW_DEMO_API_KEYS", raising=False)
    settings = Settings()
    assert settings.demo_keys_allowed() is True
    assert "http://127.0.0.1:3000" in settings.cors_origin_list()


def test_production_requires_explicit_cors(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ALLYANNA_ENV", "production")
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    with pytest.raises(ValidationError):
        Settings()


def test_production_rejects_wildcard_cors(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ALLYANNA_ENV", "production")
    monkeypatch.setenv("CORS_ORIGINS", "*")
    with pytest.raises(ValidationError):
        Settings()


def test_production_secrets_must_be_user_supplied(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ALLYANNA_ENV", "production")
    monkeypatch.setenv("CORS_ORIGINS", "https://desk.example.com")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    settings = Settings()
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        validate_production_secrets(settings)


def test_production_blocks_demo_bearer_keys(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("ALLYANNA_ENV", "production")
    monkeypatch.setenv("ALLOW_DEMO_API_KEYS", "false")
    monkeypatch.setenv("CORS_ORIGINS", "https://desk.example.com")
    # Settings are read per request; demo keys must 401 even if hashes exist in DB.
    denied = client.get(
        "/api/v1/context",
        headers={"Authorization": "Bearer allyanna-dev-key"},
    )
    assert denied.status_code == 401
    assert denied.json()["code"] == "unauthenticated"


def test_production_cors_allowlist_only(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ALLYANNA_ENV", "production")
    monkeypatch.setenv("CORS_ORIGINS", "https://desk.example.com")
    monkeypatch.setenv("DATABASE_URL", "postgresql://allyanna_app:x@127.0.0.1:5432/allyanna")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-real")

    async def _no_pool(_url: str):
        return None

    monkeypatch.setattr("allyanna.main.create_pool", _no_pool)
    app = create_app()
    with TestClient(app) as test_client:
        allowed = test_client.options(
            "/api/v1/health",
            headers={
                "Origin": "https://desk.example.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert allowed.status_code == 200
        assert allowed.headers.get("access-control-allow-origin") == "https://desk.example.com"
        blocked = test_client.options(
            "/api/v1/health",
            headers={
                "Origin": "https://evil.example",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert blocked.headers.get("access-control-allow-origin") != "https://evil.example"
