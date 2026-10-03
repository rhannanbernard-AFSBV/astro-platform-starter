"""Embedded SQLite + AppData path tests for Windows desktop mode."""

from __future__ import annotations

import os
from decimal import Decimal
from pathlib import Path
from uuid import UUID

import pytest

pytest.importorskip("aiosqlite")

from app.paths import (  # noqa: E402
    DB_FILENAME,
    get_allyanna_data_dir,
    get_sqlite_db_path,
)
from app.sqlite_db import apply_sqlite_schema, get_tenant_sqlite_session  # noqa: E402
from app.tax_engine import calculate_sxm_wage_tax_and_szv  # noqa: E402
from app.tax_tables import get_tax_rates  # noqa: E402


@pytest.fixture
def local_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    data = tmp_path / "Allyanna"
    monkeypatch.setenv("ALLYANNA_DATA_DIR", str(data))
    monkeypatch.setenv("ALLYANNA_LOCAL_MODE", "1")
    monkeypatch.setenv("ALLYANNA_DB_ENGINE", "sqlite")
    monkeypatch.delenv("ALLYANNA_SQLITE_PATH", raising=False)
    return data


def test_sqlite_path_under_allyanna_data_dir(local_data_dir: Path) -> None:
    assert get_allyanna_data_dir() == local_data_dir.resolve()
    db_path = get_sqlite_db_path()
    assert db_path == (local_data_dir / DB_FILENAME).resolve()
    # path.as_posix() used by aiosqlite works on Windows backslash paths too
    assert DB_FILENAME in db_path.as_posix()


@pytest.mark.asyncio
async def test_schema_seed_and_tenant_insert(local_data_dir: Path) -> None:
    db_path = await apply_sqlite_schema()
    assert db_path.is_file()

    tenant_id = UUID("11111111-1111-1111-1111-111111111111")
    rates = get_tax_rates(tax_year=2026, country_code="SXM")
    calc = calculate_sxm_wage_tax_and_szv(Decimal("3500.00"), rates)

    async with get_tenant_sqlite_session(tenant_id) as conn:
        assert conn.tenant_id == tenant_id
        # Pillar 2 rates present in SQLite
        result = await conn.execute(
            "SELECT tot_percentage, szv_wage_cap FROM tax_rates "
            "WHERE tax_year = %s AND country_code = %s",
            (2026, "SXM"),
        )
        row = await result.fetchone()
        assert row is not None
        assert Decimal(str(row[0])) == Decimal("0.05")

        record_id = "payroll-test-1"
        await conn.execute(
            """
            INSERT INTO payroll_records (
                id, tenant_id, employee_name, payroll_month, gross_salary,
                wage_tax_deduction, szv_employee_deduction,
                szv_employer_contribution, net_pay
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                record_id,
                str(tenant_id),
                "Frankie",
                "2026-10-01",
                str(calc.gross_monthly_salary),
                str(calc.wage_tax_deduction),
                str(calc.szv_aov_employee_deduction),
                str(calc.szv_aov_employer_contribution),
                str(calc.net_take_home_pay),
            ),
        )

        # Tenant-scoped read
        result = await conn.execute(
            "SELECT employee_name FROM payroll_records WHERE tenant_id = %s",
            (str(tenant_id),),
        )
        rows = await result.fetchall()
        assert len(rows) == 1
        assert rows[0][0] == "Frankie"

        # Cross-tenant isolation at SQL layer
        other = "99999999-9999-9999-9999-999999999999"
        result = await conn.execute(
            "SELECT employee_name FROM payroll_records WHERE tenant_id = %s",
            (other,),
        )
        assert await result.fetchall() == []


def test_windows_appdata_layout(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Simulate %LOCALAPPDATA%\\Allyanna\\local_database.db resolution."""
    local_appdata = tmp_path / "AppData" / "Local"
    monkeypatch.setenv("LOCALAPPDATA", str(local_appdata))
    monkeypatch.delenv("ALLYANNA_DATA_DIR", raising=False)
    monkeypatch.delenv("ALLYANNA_SQLITE_PATH", raising=False)
    monkeypatch.setattr("app.paths.is_windows", lambda: True)

    from app.paths import get_allyanna_data_dir as gad
    from app.paths import get_sqlite_db_path as gdb

    assert gad() == local_appdata / "Allyanna"
    assert gdb() == local_appdata / "Allyanna" / "local_database.db"
