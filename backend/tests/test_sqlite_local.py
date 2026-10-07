"""Embedded SQLite + AppData path tests for Windows desktop mode."""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path
from uuid import UUID

import pytest

pytest.importorskip("aiosqlite")

from app.local_ledger import (  # noqa: E402
    get_local_db_connection,
    initialize_local_sxm_tables,
)
from app.paths import (  # noqa: E402
    DB_FILENAME,
    LEGACY_DB_FILENAME,
    get_allyanna_data_dir,
    get_sqlite_db_path,
)
from app.sqlite_db import get_tenant_sqlite_session  # noqa: E402
from app.tax_engine import calculate_sxm_wage_tax_and_szv  # noqa: E402
from app.tax_tables import get_tax_rates  # noqa: E402


@pytest.fixture
def local_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    data = tmp_path / "Allyanna"
    monkeypatch.setenv("ALLYANNA_DATA_DIR", str(data))
    monkeypatch.setenv("ALLYANNA_LOCAL_MODE", "1")
    monkeypatch.setenv("ALLYANNA_DB_ENGINE", "sqlite")
    monkeypatch.delenv("ALLYANNA_SQLITE_PATH", raising=False)
    monkeypatch.delenv("LOCALAPPDATA", raising=False)
    return data


def test_sqlite_path_under_allyanna_data_dir(local_data_dir: Path) -> None:
    assert get_allyanna_data_dir() == local_data_dir.resolve()
    db_path = get_sqlite_db_path()
    assert db_path == (local_data_dir / DB_FILENAME).resolve()
    assert DB_FILENAME == "allyanna_ledger.db"
    assert DB_FILENAME in db_path.as_posix()


def test_frankie_initialize_and_connection(local_data_dir: Path) -> None:
    path = initialize_local_sxm_tables()
    assert path.name == "allyanna_ledger.db"
    assert path.is_file()

    conn = get_local_db_connection()
    try:
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        assert "local_invoices" in tables
        assert "local_payroll_records" in tables
        assert "tax_rates" in tables
        assert "wage_tax_brackets" in tables

        # Money affinity must not be REAL — declare TEXT in schema
        inv_cols = {
            r[1]: r[2]
            for r in conn.execute("PRAGMA table_info(local_invoices)").fetchall()
        }
        assert inv_cols["tenant_id"] == "TEXT"
        assert inv_cols["subtotal"] == "TEXT"
        assert inv_cols["tot_amount"] == "TEXT"
        assert inv_cols["grand_total"] == "TEXT"

        pay_cols = {
            r[1]: r[2]
            for r in conn.execute("PRAGMA table_info(local_payroll_records)").fetchall()
        }
        assert pay_cols["tenant_id"] == "TEXT"
        assert pay_cols["gross_salary"] == "TEXT"
        assert pay_cols["net_pay"] == "TEXT"

        rate = conn.execute(
            "SELECT tot_percentage FROM tax_rates "
            "WHERE tax_year = ? AND country_code = ?",
            (2026, "SXM"),
        ).fetchone()
        assert rate is not None
        assert Decimal(str(rate[0])) == Decimal("0.05")
    finally:
        conn.close()


def test_legacy_db_filename_renamed(local_data_dir: Path) -> None:
    legacy = local_data_dir / LEGACY_DB_FILENAME
    local_data_dir.mkdir(parents=True, exist_ok=True)
    legacy.write_bytes(b"")  # empty placeholder; init will open/migrate schema
    # Empty file isn't a valid sqlite DB — create a real legacy sqlite file
    import sqlite3

    legacy.unlink()
    c = sqlite3.connect(str(legacy))
    c.execute("CREATE TABLE marker (id INTEGER)")
    c.commit()
    c.close()

    conn = get_local_db_connection()
    conn.close()
    assert (local_data_dir / DB_FILENAME).is_file()
    assert not legacy.is_file()


@pytest.mark.asyncio
async def test_schema_seed_and_tenant_insert(local_data_dir: Path) -> None:
    db_path = initialize_local_sxm_tables()
    assert db_path.is_file()

    tenant_id = UUID("11111111-1111-1111-1111-111111111111")
    rates = get_tax_rates(tax_year=2026, country_code="SXM")
    calc = calculate_sxm_wage_tax_and_szv(Decimal("3500.00"), rates)

    async with get_tenant_sqlite_session(tenant_id) as conn:
        assert conn.tenant_id == tenant_id
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
            INSERT INTO local_payroll_records (
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

        result = await conn.execute(
            "SELECT employee_name FROM local_payroll_records WHERE tenant_id = %s",
            (str(tenant_id),),
        )
        rows = await result.fetchall()
        assert len(rows) == 1
        assert rows[0][0] == "Frankie"

        other = "99999999-9999-9999-9999-999999999999"
        result = await conn.execute(
            "SELECT employee_name FROM local_payroll_records WHERE tenant_id = %s",
            (other,),
        )
        assert await result.fetchall() == []


def test_windows_appdata_layout(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Simulate %LOCALAPPDATA%\\Allyanna\\allyanna_ledger.db resolution."""
    local_appdata = tmp_path / "AppData" / "Local"
    monkeypatch.setenv("LOCALAPPDATA", str(local_appdata))
    monkeypatch.delenv("ALLYANNA_DATA_DIR", raising=False)
    monkeypatch.delenv("ALLYANNA_SQLITE_PATH", raising=False)
    monkeypatch.setattr("app.paths.is_windows", lambda: True)

    from app.paths import get_allyanna_data_dir as gad
    from app.paths import get_sqlite_db_path as gdb

    assert gad() == local_appdata / "Allyanna"
    assert gdb() == local_appdata / "Allyanna" / "allyanna_ledger.db"
