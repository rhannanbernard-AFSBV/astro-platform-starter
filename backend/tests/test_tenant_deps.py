"""Unit tests for X-Tenant-ID validation and mocked tenant DB session."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any, AsyncIterator
from unittest.mock import MagicMock
from uuid import UUID

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.db import get_database_url, get_tenant_db_session
from app.deps import get_tenant_context, get_tenant_db, verify_tenant_access_token

VALID_TENANT = "11111111-1111-1111-1111-111111111111"
VALID_USER = "22222222-2222-2222-2222-222222222222"


def _header_app() -> FastAPI:
    app = FastAPI()

    @app.get("/tenant-only")
    async def tenant_only(
        tenant_id: UUID = Depends(verify_tenant_access_token),
    ) -> dict[str, str]:
        return {"tenant_id": str(tenant_id)}

    @app.get("/context")
    async def context(tenant=Depends(get_tenant_context)) -> dict[str, str]:
        return {
            "tenant_id": str(tenant.tenant_id),
            "user_id": str(tenant.user_id),
            "role": tenant.role,
        }

    return app


def test_verify_tenant_access_token_invalid_uuid_returns_400() -> None:
    client = TestClient(_header_app())
    response = client.get(
        "/tenant-only",
        headers={"X-Tenant-ID": "not-a-uuid"},
    )
    assert response.status_code == 400
    assert "X-Tenant-ID" in response.json()["detail"]


def test_verify_tenant_access_token_missing_header_returns_422() -> None:
    client = TestClient(_header_app())
    response = client.get("/tenant-only")
    assert response.status_code == 422


def test_verify_tenant_access_token_valid_uuid() -> None:
    client = TestClient(_header_app())
    response = client.get(
        "/tenant-only",
        headers={"X-Tenant-ID": VALID_TENANT},
    )
    assert response.status_code == 200
    assert response.json()["tenant_id"] == VALID_TENANT


def test_get_tenant_context_invalid_uuid_returns_400() -> None:
    client = TestClient(_header_app())
    response = client.get(
        "/context",
        headers={
            "X-Tenant-ID": "bad-tenant",
            "X-User-Id": VALID_USER,
        },
    )
    assert response.status_code == 400
    assert "X-Tenant-ID" in response.json()["detail"]


def test_get_tenant_context_bearer_stub_still_works() -> None:
    """Chat API contract: Bearer demo token must not require X-Tenant-ID."""
    client = TestClient(_header_app())
    response = client.get(
        "/context",
        headers={"Authorization": "Bearer demo-tenant-token"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["tenant_id"] == VALID_TENANT
    assert body["user_id"] == VALID_USER


def test_get_database_url_missing_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in (
        "ALLYANNA_DATABASE_URL",
        "DATABASE_URL",
        "ALLYANNA_DB_HOST",
        "ALLYANNA_DB_USER",
        "ALLYANNA_DB_PASSWORD",
        "ALLYANNA_DB_NAME",
        "PGHOST",
        "PGUSER",
        "PGPASSWORD",
        "PGDATABASE",
    ):
        monkeypatch.delenv(key, raising=False)

    with pytest.raises(RuntimeError, match="Database URL not configured"):
        get_database_url()


def test_get_database_url_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(
        "ALLYANNA_DATABASE_URL",
        "postgresql://allyanna_app_user@localhost:5432/allyanna_db",
    )
    assert "allyanna_app_user" in (get_database_url() or "")


@pytest.mark.asyncio
async def test_get_tenant_db_session_sets_local_guc(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Mocked connect: ensures SET LOCAL runs inside an open transaction."""
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql://allyanna_app_user@localhost:5432/allyanna_db",
    )

    executed: list[str] = []

    class FakeTransaction:
        async def __aenter__(self) -> FakeTransaction:
            return self

        async def __aexit__(self, *args: Any) -> None:
            return None

    class FakeConn:
        def transaction(self) -> FakeTransaction:
            return FakeTransaction()

        def execute(self, sql: str, *args: Any, **kwargs: Any) -> Any:
            executed.append(sql)
            return None

        async def close(self) -> None:
            return None

    async def fake_connect(url: str) -> FakeConn:
        assert "localhost" in url
        return FakeConn()

    monkeypatch.setattr("app.db.psycopg.AsyncConnection.connect", fake_connect)

    tenant = UUID(VALID_TENANT)
    async with get_tenant_db_session(tenant) as conn:
        assert isinstance(conn, FakeConn)

    assert any(
        "SET LOCAL app.current_tenant_id" in sql and VALID_TENANT in sql
        for sql in executed
    )


@pytest.mark.asyncio
async def test_get_tenant_db_dependency_mocked() -> None:
    """Integration-style: FastAPI Depends(get_tenant_db) with mocked session."""

    @asynccontextmanager
    async def fake_session(tenant_id: UUID) -> AsyncIterator[MagicMock]:
        conn = MagicMock()
        conn.tenant_id = tenant_id
        yield conn

    app = FastAPI()

    async def override_db(
        tenant_id: UUID = Depends(verify_tenant_access_token),
    ) -> AsyncIterator[MagicMock]:
        async with fake_session(tenant_id) as conn:
            yield conn

    app.dependency_overrides[get_tenant_db] = override_db

    @app.get("/db")
    async def db_route(conn: MagicMock = Depends(get_tenant_db)) -> dict[str, str]:
        return {"tenant_id": str(conn.tenant_id)}

    client = TestClient(app)
    bad = client.get("/db", headers={"X-Tenant-ID": "nope"})
    assert bad.status_code == 400

    ok = client.get("/db", headers={"X-Tenant-ID": VALID_TENANT})
    assert ok.status_code == 200
    assert ok.json()["tenant_id"] == VALID_TENANT
