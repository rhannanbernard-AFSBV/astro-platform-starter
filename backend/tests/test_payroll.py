"""Monthly withholding from the loonbelasting table, and tenant-scoped payroll runs."""

from uuid import UUID

import asyncpg
import pytest
from fastapi.testclient import TestClient

GREAT_BAY = "22222222-2222-4222-8222-222222222221"
SIMPSON_BAY = "22222222-2222-4222-8222-222222222222"
OTHER_TENANT = "22222222-2222-4222-8222-222222222223"
DEMO_USER = "33333333-3333-4333-8333-333333333333"
OTHER_USER = UUID("33333333-3333-4333-8333-333333333334")
HARBOUR = UUID("11111111-1111-4111-8111-111111111111")
OTHER_FIRM = UUID("11111111-1111-4111-8111-111111111112")
GREAT_BAY_ID = UUID(GREAT_BAY)
DEV_KEY = "allyanna-dev-key"
OTHER_KEY = "allyanna-other-key"
MONTHLY_SCHEDULE = "a1000000-0000-4000-8000-000000000004"


def _auth(key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {key}"}


def _clear(admin_sql) -> None:
    admin_sql("DELETE FROM allyanna.payroll_runs")


def _switch(client: TestClient, key: str, tenant_id: str) -> None:
    switched = client.post(
        "/api/v1/context/switch",
        headers=_auth(key),
        json={"tenant_id": tenant_id},
    )
    assert switched.status_code == 200


def test_monthly_table_is_loaded_and_drives_withholding(client: TestClient, database_url: str) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    schedules = client.get(
        "/api/v1/tax/schedules",
        headers=_auth(DEV_KEY),
        params={"tax_year": 2026, "country_code": "SXM"},
    )
    assert schedules.status_code == 200
    by_code = {item["schedule_code"]: item for item in schedules.json()["schedules"]}
    monthly = by_code["WAGE_TAX_MONTHLY"]
    assert monthly["calculation_method"] == "wage_class_lookup"
    assert monthly["amount_period"] == "month"
    summary = monthly["withholding"]
    assert summary["row_count"] == 2516
    assert summary["first_wage_amount"] == "1587.33"
    assert summary["last_wage_amount"] == "14162.33"
    assert summary["last_tax_amount"] == "3933.16"
    assert summary["withholding_free_maximum"] == "2273.44"
    assert summary["monthly_acquisition_cost"] == "41.67"
    assert summary["excess_rate"] == "0.475"
    components = {item["component_code"]: item for item in by_code["SZV"]["components"]}
    assert components["AOV"]["reduces_wage_tax_base"] is True
    assert components["AWW"]["reduces_wage_tax_base"] is True
    assert components["ZV"]["reduces_wage_tax_base"] is False
    assert components["OV"]["reduces_wage_tax_base"] is False

    at_cap = client.post(
        "/api/v1/tax/wage-monthly",
        headers=_auth(DEV_KEY),
        json={"tax_year": 2026, "country_code": "SXM", "wage_tax_base": "15000.00"},
    )
    assert at_cap.status_code == 200
    body = at_cap.json()
    assert body["tax_amount"] == "4331.05"
    assert body["method"] == "table_plus_excess"
    assert body["table_wage_amount"] == "14162.33"
    assert body["table_tax_amount"] == "3933.16"
    assert body["excess_wage"] == "837.67"
    assert body["excess_rate"] == "0.475"
    assert body["amount_period"] == "month"

    free = client.post(
        "/api/v1/tax/wage-monthly",
        headers=_auth(DEV_KEY),
        json={"tax_year": 2026, "country_code": "SXM", "wage_tax_base": "2273.44"},
    )
    assert free.status_code == 200
    assert free.json()["tax_amount"] == "0.00"
    assert free.json()["method"] == "free_threshold"

    import asyncio

    async def _steps() -> None:
        conn = await asyncpg.connect(database_url)
        try:
            gaps = await conn.fetchval(
                """
                SELECT count(*)
                FROM (
                  SELECT wage_amount - lag(wage_amount) OVER (ORDER BY wage_amount) AS step
                  FROM allyanna.wage_tax_lookup_rows
                  WHERE tax_schedule_id = $1::uuid
                ) AS classes
                WHERE step IS NOT NULL AND step <> 5.00
                """,
                MONTHLY_SCHEDULE,
            )
            assert gaps == 0
        finally:
            await conn.close()

    asyncio.run(_steps())


def test_payroll_run_uses_the_table_and_szv_calculator(client: TestClient, admin_sql) -> None:
    _clear(admin_sql)
    _switch(client, DEV_KEY, GREAT_BAY)
    created = client.post(
        "/api/v1/payroll/runs",
        headers=_auth(DEV_KEY),
        json={
            "period_year": 2026,
            "period_month": 3,
            "lines": [
                {
                    "employee_name": "A. Richardson",
                    "employee_code": "EMP-1",
                    "gross_wage": "2473.16",
                },
                {
                    "employee_name": "M. Richardson",
                    "employee_code": "EMP-2",
                    "gross_wage": "15751.99",
                },
            ],
        },
    )
    assert created.status_code == 201
    body = created.json()
    assert body["tenant_id"] == GREAT_BAY
    assert body["employee_count"] == 2
    assert body["gross_wages"] == "18225.15"
    assert body["wage_tax_total"] == "4331.05"
    assert body["employee_szv_total"] == "1394.95"
    assert body["employer_szv_total"] == "2102.73"
    assert body["net_wages"] == "12499.15"
    low, high = body["lines"]
    assert low["acquisition_cost"] == "41.67"
    assert low["aov_aww_employee_deduction"] == "158.05"
    assert low["wage_tax_base"] == "2273.44"
    assert low["wage_tax_withheld"] == "0.00"
    assert low["withholding_method"] == "free_threshold"
    assert low["employee_szv_total"] == "264.63"
    assert low["net_wage"] == "2208.53"
    premiums = {item["component_code"]: item for item in low["szv_lines"]}
    assert premiums["AOV"]["employee_amount"] == "148.39"
    assert premiums["AWW"]["employee_amount"] == "12.37"
    assert premiums["OV"]["employer_rate"] == "0.005"
    assert high["wage_tax_base"] == "15000.00"
    assert high["wage_tax_withheld"] == "4331.05"
    assert high["withholding_method"] == "table_plus_excess"
    assert high["employee_szv_total"] == "1130.32"
    assert high["employer_szv_total"] == "1699.60"
    assert high["net_wage"] == "10290.62"
    assert isinstance(high["wage_tax_withheld"], str)

    again = client.post(
        "/api/v1/payroll/runs",
        headers=_auth(DEV_KEY),
        json={
            "period_year": 2026,
            "period_month": 3,
            "lines": [{"employee_name": "A. Richardson", "gross_wage": "2473.16"}],
        },
    )
    assert again.status_code == 409
    assert again.json()["code"] == "duplicate_payroll_period"
    floated = client.post(
        "/api/v1/payroll/runs",
        headers=_auth(DEV_KEY),
        json={
            "period_year": 2026,
            "period_month": 4,
            "lines": [{"employee_name": "A. Richardson", "gross_wage": 2473.16}],
        },
    )
    assert floated.status_code == 422


def test_withholding_follows_updated_table_rows(client: TestClient, admin_sql) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    admin_sql(
        f"""
        UPDATE allyanna.wage_tax_withholding_rules
        SET withholding_free_maximum = 0.00
        WHERE tax_schedule_id = '{MONTHLY_SCHEDULE}'
        """
    )
    try:
        opened = client.post(
            "/api/v1/tax/wage-monthly",
            headers=_auth(DEV_KEY),
            json={"tax_year": 2026, "country_code": "SXM", "wage_tax_base": "2272.33"},
        )
        assert opened.status_code == 200
        assert opened.json()["method"] == "table"
        assert opened.json()["tax_amount"] == "85.62"
    finally:
        admin_sql(
            f"""
            UPDATE allyanna.wage_tax_withholding_rules
            SET withholding_free_maximum = 2273.44
            WHERE tax_schedule_id = '{MONTHLY_SCHEDULE}'
            """
        )
    admin_sql(
        f"""
        UPDATE allyanna.wage_tax_withholding_rules
        SET excess_rate = 0.10000000
        WHERE tax_schedule_id = '{MONTHLY_SCHEDULE}'
        """
    )
    try:
        changed = client.post(
            "/api/v1/tax/wage-monthly",
            headers=_auth(DEV_KEY),
            json={"tax_year": 2026, "country_code": "SXM", "wage_tax_base": "15000.00"},
        )
        assert changed.status_code == 200
        assert changed.json()["excess_rate"] == "0.1"
        assert changed.json()["tax_amount"] == "4016.93"
    finally:
        admin_sql(
            f"""
            UPDATE allyanna.wage_tax_withholding_rules
            SET excess_rate = 0.47500000
            WHERE tax_schedule_id = '{MONTHLY_SCHEDULE}'
            """
        )


def test_payroll_requires_the_active_profile(client: TestClient, admin_sql) -> None:
    admin_sql(f"DELETE FROM allyanna.user_active_contexts WHERE user_id = '{DEMO_USER}'")
    missing = client.post(
        "/api/v1/payroll/runs",
        headers=_auth(DEV_KEY),
        json={
            "period_year": 2026,
            "period_month": 5,
            "lines": [{"employee_name": "A. Richardson", "gross_wage": "2473.16"}],
        },
    )
    assert missing.status_code == 409
    assert missing.json()["code"] == "tenant_context_required"


def test_one_firm_cannot_read_another_firms_payroll(
    client: TestClient,
    admin_sql,
    database_url: str,
) -> None:
    _clear(admin_sql)
    _switch(client, DEV_KEY, GREAT_BAY)
    created = client.post(
        "/api/v1/payroll/runs",
        headers=_auth(DEV_KEY),
        json={
            "period_year": 2026,
            "period_month": 6,
            "lines": [
                {"employee_name": "Philipsburg Crew", "employee_code": "PX-1", "gross_wage": "3000.00"}
            ],
        },
    )
    assert created.status_code == 201
    run_id = created.json()["id"]
    assert created.json()["tenant_id"] == GREAT_BAY

    _switch(client, DEV_KEY, SIMPSON_BAY)
    sibling = client.get(f"/api/v1/payroll/runs/{run_id}", headers=_auth(DEV_KEY))
    assert sibling.status_code == 404
    assert sibling.json()["code"] == "payroll_not_found"
    sibling_list = client.get("/api/v1/payroll/runs", headers=_auth(DEV_KEY))
    assert sibling_list.status_code == 200
    assert sibling_list.json()["tenant_id"] == SIMPSON_BAY
    assert sibling_list.json()["runs"] == []

    _switch(client, OTHER_KEY, OTHER_TENANT)
    other = client.get(f"/api/v1/payroll/runs/{run_id}", headers=_auth(OTHER_KEY))
    assert other.status_code == 404
    assert other.json()["code"] == "payroll_not_found"
    other_list = client.get("/api/v1/payroll/runs", headers=_auth(OTHER_KEY))
    assert other_list.status_code == 200
    assert other_list.json()["runs"] == []

    import asyncio

    async def _sql() -> None:
        conn = await asyncpg.connect(database_url)
        try:
            async with conn.transaction():
                await conn.execute(
                    "SELECT set_config('allyanna.user_id', $1, true)",
                    str(OTHER_USER),
                )
                await conn.execute(
                    "SELECT set_config('allyanna.master_account_id', $1, true)",
                    str(OTHER_FIRM),
                )
                await conn.execute(
                    "SELECT set_config('allyanna.tenant_id', $1, true)",
                    str(GREAT_BAY_ID),
                )
                visible = await conn.fetch("SELECT id FROM allyanna.payroll_runs")
                assert visible == []
            with pytest.raises(asyncpg.InsufficientPrivilegeError):
                async with conn.transaction():
                    await conn.execute(
                        "SELECT set_config('allyanna.user_id', $1, true)",
                        str(OTHER_USER),
                    )
                    await conn.execute(
                        "SELECT set_config('allyanna.master_account_id', $1, true)",
                        str(OTHER_FIRM),
                    )
                    await conn.execute(
                        "SELECT set_config('allyanna.tenant_id', $1, true)",
                        str(GREAT_BAY_ID),
                    )
                    await conn.execute(
                        """
                        INSERT INTO allyanna.payroll_runs (
                          tenant_id, period_year, period_month, country_code, currency_code,
                          wage_tax_schedule_id, szv_schedule_id, employee_count,
                          gross_wages, employee_szv_total, employer_szv_total,
                          wage_tax_total, net_wages
                        )
                        VALUES (
                          current_setting('allyanna.tenant_id', true)::uuid,
                          2026, 7, 'SXM', 'XCG',
                          $1::uuid, $1::uuid, 1,
                          1.00, 0.00, 0.00, 0.00, 1.00
                        )
                        """,
                        MONTHLY_SCHEDULE,
                    )
            async with conn.transaction():
                await conn.execute(
                    "SELECT set_config('allyanna.user_id', $1, true)",
                    DEMO_USER,
                )
                await conn.execute(
                    "SELECT set_config('allyanna.master_account_id', $1, true)",
                    str(HARBOUR),
                )
                await conn.execute(
                    "SELECT set_config('allyanna.tenant_id', $1, true)",
                    SIMPSON_BAY,
                )
                assert await conn.fetch("SELECT id FROM allyanna.payroll_runs") == []
                await conn.execute(
                    "SELECT set_config('allyanna.tenant_id', $1, true)",
                    GREAT_BAY,
                )
                names = await conn.fetch(
                    """
                    SELECT employee_name
                    FROM allyanna.payroll_lines
                    WHERE payroll_run_id = $1::uuid
                    """,
                    run_id,
                )
                assert [row["employee_name"] for row in names] == ["Philipsburg Crew"]
        finally:
            await conn.close()

    asyncio.run(_sql())
