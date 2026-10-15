"""Invoice persist route validation (mocked DB)."""

from __future__ import annotations

from contextlib import asynccontextmanager
from decimal import Decimal
from typing import Any, AsyncIterator
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.main import app

VALID_TENANT = "11111111-1111-1111-1111-111111111111"
INVOICE_ID = UUID("bbbbbbbb-cccc-dddd-eeee-ffffffffffff")


@pytest.fixture
def client_with_mocked_db(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    executed: list[tuple[str, tuple[Any, ...]]] = []
    # Pin Postgres SQL branch (desktop default engine is sqlite / local_* tables).
    monkeypatch.setenv("ALLYANNA_DB_ENGINE", "postgres")
    monkeypatch.setenv("ALLYANNA_LOCAL_MODE", "0")

    class FakeResult:
        async def fetchone(self) -> tuple[UUID]:
            return (INVOICE_ID,)

    class FakeConn:
        async def execute(self, sql: str, params: tuple[Any, ...] | None = None) -> FakeResult:
            executed.append((sql, params or ()))
            return FakeResult()

    @asynccontextmanager
    async def fake_session(tenant_id: UUID) -> AsyncIterator[FakeConn]:
        assert tenant_id == UUID(VALID_TENANT)
        yield FakeConn()

    monkeypatch.setattr("app.routes.invoices.get_tenant_db_session", fake_session)
    monkeypatch.setattr("app.routes.invoices.get_db_engine", lambda: "postgres")
    client = TestClient(app)
    client.fake_executed = executed  # type: ignore[attr-defined]
    return client


def test_persist_invoice_success_mocked_db(client_with_mocked_db: TestClient) -> None:
    response = client_with_mocked_db.post(
        "/api/v1/invoices/persist",
        headers={"X-Tenant-ID": VALID_TENANT},
        json={
            "vendor_name": "Philips Hardware NV",
            "invoice_date": "2026-03-15",
            "subtotal": "100.00",
            "tot_amount": "5.00",
            "grand_total": "105.00",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "Success"
    assert body["invoice_id"] == str(INVOICE_ID)
    assert body["tenant_id"] == VALID_TENANT
    assert body["vendor_name"] == "Philips Hardware NV"
    assert body["subtotal"] == "100.00"
    assert body["tot_amount"] == "5.00"
    assert body["grand_total"] == "105.00"

    executed = client_with_mocked_db.fake_executed  # type: ignore[attr-defined]
    assert len(executed) == 1
    sql, params = executed[0]
    assert "INSERT INTO invoices" in sql
    assert params[0] == VALID_TENANT
    assert params[1] == "Philips Hardware NV"
    assert params[3] == Decimal("100.00")
    assert params[4] == Decimal("5.00")
    assert params[5] == Decimal("105.00")


def test_persist_invoice_invalid_tenant_returns_400(
    client_with_mocked_db: TestClient,
) -> None:
    response = client_with_mocked_db.post(
        "/api/v1/invoices/persist",
        headers={"X-Tenant-ID": "bad"},
        json={
            "vendor_name": "X",
            "invoice_date": "2026-03-15",
            "subtotal": "1.00",
            "tot_amount": "0.05",
            "grand_total": "1.05",
        },
    )
    assert response.status_code == 400
    assert client_with_mocked_db.fake_executed == []  # type: ignore[attr-defined]


def test_persist_invoice_bad_date_returns_422(
    client_with_mocked_db: TestClient,
) -> None:
    response = client_with_mocked_db.post(
        "/api/v1/invoices/persist",
        headers={"X-Tenant-ID": VALID_TENANT},
        json={
            "vendor_name": "X",
            "invoice_date": "15/03/2026",
            "subtotal": "1.00",
            "tot_amount": "0.05",
            "grand_total": "1.05",
        },
    )
    assert response.status_code == 422
    assert "invoice_date" in response.json()["detail"]


def test_persist_invoice_missing_tenant_returns_422(
    client_with_mocked_db: TestClient,
) -> None:
    response = client_with_mocked_db.post(
        "/api/v1/invoices/persist",
        json={
            "vendor_name": "X",
            "invoice_date": "2026-03-15",
            "subtotal": "1.00",
            "tot_amount": "0.05",
            "grand_total": "1.05",
        },
    )
    assert response.status_code == 422
