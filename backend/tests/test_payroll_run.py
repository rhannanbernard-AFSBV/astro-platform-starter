"""Focused tests: wage/SZV math path + payroll route validation (mocked DB)."""

from __future__ import annotations

from contextlib import asynccontextmanager
from decimal import Decimal
from typing import Any, AsyncIterator
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas import TaxRatesSXM
from app.tax_engine import calculate_sxm_wage_tax_and_szv

VALID_TENANT = "11111111-1111-1111-1111-111111111111"
RECORD_ID = UUID("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")


def test_math_path_wage_spans_brackets(sxm_2026_rates: TaxRatesSXM) -> None:
    result = calculate_sxm_wage_tax_and_szv(Decimal("3000.00"), sxm_2026_rates)
    assert result.wage_tax_deduction == Decimal("400.00")
    assert result.szv_aov_employee_deduction == Decimal("142.50")
    assert result.szv_aov_employer_contribution == Decimal("247.50")
    assert result.net_take_home_pay == Decimal("2457.50")
    assert isinstance(result.net_take_home_pay, Decimal)
    assert not isinstance(result.net_take_home_pay, float)


def test_math_path_szv_wage_cap(sxm_2026_rates: TaxRatesSXM) -> None:
    result = calculate_sxm_wage_tax_and_szv(Decimal("8000.00"), sxm_2026_rates)
    assert result.szv_assessable_wage == Decimal("5600.00")
    assert result.szv_aov_employee_deduction == Decimal("266.00")
    assert result.wage_tax_deduction == Decimal("1400.00")
    assert result.net_take_home_pay == Decimal("6334.00")


def test_math_path_all_fields_are_decimal(sxm_2026_rates: TaxRatesSXM) -> None:
    result = calculate_sxm_wage_tax_and_szv(Decimal("2500.00"), sxm_2026_rates)
    for name, value in result.model_dump().items():
        assert isinstance(value, Decimal), f"{name} must be Decimal, got {type(value)}"


@pytest.fixture
def client_with_mocked_db(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """Patch async get_tenant_db_session so route tests never touch Postgres."""
    executed: list[tuple[str, tuple[Any, ...]]] = []

    class FakeResult:
        async def fetchone(self) -> tuple[UUID]:
            return (RECORD_ID,)

    class FakeConn:
        async def execute(self, sql: str, params: tuple[Any, ...] | None = None) -> FakeResult:
            executed.append((sql, params or ()))
            return FakeResult()

    @asynccontextmanager
    async def fake_session(tenant_id: UUID) -> AsyncIterator[FakeConn]:
        assert tenant_id == UUID(VALID_TENANT)
        yield FakeConn()

    monkeypatch.setattr("app.routes.payroll.get_tenant_db_session", fake_session)
    client = TestClient(app)
    client.fake_executed = executed  # type: ignore[attr-defined]
    return client


def test_process_monthly_run_success_mocked_db(
    client_with_mocked_db: TestClient,
) -> None:
    response = client_with_mocked_db.post(
        "/api/v1/payroll/process-monthly-run",
        headers={"X-Tenant-ID": VALID_TENANT},
        json={
            "employee_name": "Ana Philips",
            "gross_salary": "3000.00",
            "tax_year": 2026,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "Success"
    assert body["payroll_record_id"] == str(RECORD_ID)
    assert body["tenant_id"] == VALID_TENANT
    assert "Ana Philips" in body["message"]

    calc = body["calculations"]
    assert calc["gross_monthly_salary"] == "3000.00"
    assert calc["wage_tax_deduction"] == "400.00"
    assert calc["szv_aov_employee_deduction"] == "142.50"
    assert calc["szv_aov_employer_contribution"] == "247.50"
    assert calc["net_take_home_pay"] == "2457.50"

    executed = client_with_mocked_db.fake_executed  # type: ignore[attr-defined]
    assert len(executed) == 1
    sql, params = executed[0]
    assert "INSERT INTO payroll_records" in sql
    assert params[0] == VALID_TENANT
    assert params[1] == "Ana Philips"
    assert params[2] == Decimal("3000.00")
    assert params[3] == Decimal("400.00")
    assert params[4] == Decimal("142.50")
    assert params[5] == Decimal("247.50")
    assert params[6] == Decimal("2457.50")


def test_process_monthly_run_invalid_tenant_header_returns_400(
    client_with_mocked_db: TestClient,
) -> None:
    response = client_with_mocked_db.post(
        "/api/v1/payroll/process-monthly-run",
        headers={"X-Tenant-ID": "not-a-uuid"},
        json={"employee_name": "Ana Philips", "gross_salary": "3000.00"},
    )
    assert response.status_code == 400
    assert "X-Tenant-ID" in response.json()["detail"]
    assert client_with_mocked_db.fake_executed == []  # type: ignore[attr-defined]


def test_process_monthly_run_missing_tenant_header_returns_422(
    client_with_mocked_db: TestClient,
) -> None:
    response = client_with_mocked_db.post(
        "/api/v1/payroll/process-monthly-run",
        json={"employee_name": "Ana Philips", "gross_salary": "3000.00"},
    )
    assert response.status_code == 422


def test_process_monthly_run_rejects_non_positive_gross(
    client_with_mocked_db: TestClient,
) -> None:
    response = client_with_mocked_db.post(
        "/api/v1/payroll/process-monthly-run",
        headers={"X-Tenant-ID": VALID_TENANT},
        json={"employee_name": "Ana Philips", "gross_salary": "0"},
    )
    assert response.status_code == 422
