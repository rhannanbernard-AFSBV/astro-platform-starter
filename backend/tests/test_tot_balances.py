"""The active profile can see tax due, paid, and remaining on every filing."""

from decimal import Decimal
from uuid import UUID

import asyncpg
import pytest
from fastapi.testclient import TestClient

from allyanna.tenancy.repository import TenancyRepository

GREAT_BAY = "22222222-2222-4222-8222-222222222221"
SIMPSON_BAY = "22222222-2222-4222-8222-222222222222"
OTHER_TENANT = "22222222-2222-4222-8222-222222222223"
HARBOUR = UUID("11111111-1111-4111-8111-111111111111")
OTHER_FIRM = UUID("11111111-1111-4111-8111-111111111112")
DEMO_USER = "33333333-3333-4333-8333-333333333333"
DEV_KEY = "allyanna-dev-key"
OTHER_KEY = "allyanna-other-key"


def _auth(key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {key}"}


def _switch(client: TestClient, key: str, tenant_id: str) -> None:
    switched = client.post(
        "/api/v1/context/switch",
        headers=_auth(key),
        json={"tenant_id": tenant_id},
    )
    assert switched.status_code == 200


def _file(client: TestClient, key: str, start: str, end: str) -> object:
    return client.post(
        "/api/v1/tax/tot/returns",
        headers=_auth(key),
        json={
            "period_start": start,
            "period_end": end,
            "tax_year": 2026,
            "country_code": "SXM",
        },
    )


def _balances(client: TestClient, key: str) -> object:
    return client.get("/api/v1/tax/tot/balances", headers=_auth(key))


def test_balances_require_a_business_profile(client: TestClient, admin_sql) -> None:
    admin_sql(f"DELETE FROM allyanna.user_active_contexts WHERE user_id = '{DEMO_USER}'")
    missing = _balances(client, DEV_KEY)
    assert missing.status_code == 409
    assert missing.json()["code"] == "tenant_context_required"


def test_profile_balances_use_the_filed_tax_and_recorded_payments(client: TestClient) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    early = client.post(
        "/api/v1/invoices",
        headers=_auth(DEV_KEY),
        json={
            "vendor_name": "March Goods",
            "invoice_number": "BAL-200",
            "invoice_date": "2026-03-01",
            "tax_year": 2026,
            "country_code": "SXM",
            "lines": [{"description": "Goods", "quantity": "2", "unit_price": "100.00"}],
        },
    )
    later = client.post(
        "/api/v1/invoices",
        headers=_auth(DEV_KEY),
        json={
            "vendor_name": "May Goods",
            "invoice_number": "BAL-MAY",
            "invoice_date": "2026-05-15",
            "tax_year": 2026,
            "country_code": "SXM",
            "lines": [{"description": "Goods", "quantity": "2", "unit_price": "100.00"}],
        },
    )
    assert early.status_code == 201
    assert later.status_code == 201
    march = _file(client, DEV_KEY, "2026-03-01", "2026-03-14")
    may = _file(client, DEV_KEY, "2026-05-02", "2026-05-31")
    assert march.status_code == 201
    assert may.status_code == 201
    assert march.json()["tot_amount"] == "10.00"
    assert march.json()["grand_total"] == "210.00"
    assert may.json()["tot_amount"] == "10.00"
    march_id = march.json()["id"]
    may_id = may.json()["id"]

    partial = client.post(
        f"/api/v1/tax/tot/returns/{march_id}/payments",
        headers=_auth(DEV_KEY),
        json={"amount": "3.00", "paid_on": "2026-03-20"},
    )
    settled = client.post(
        f"/api/v1/tax/tot/returns/{may_id}/payments",
        headers=_auth(DEV_KEY),
        json={"amount": "10.00", "paid_on": "2026-05-20"},
    )
    assert partial.status_code == 201
    assert settled.status_code == 201

    listed = _balances(client, DEV_KEY)
    assert listed.status_code == 200
    body = listed.json()
    assert body["tenant_id"] == GREAT_BAY
    rows = {row["return_id"]: row for row in body["returns"]}
    assert rows[march_id]["tax_due"] == "10.00"
    assert rows[march_id]["amount_paid"] == "3.00"
    assert rows[march_id]["balance_due"] == "7.00"
    assert rows[march_id]["period_start"] == "2026-03-01"
    assert rows[march_id]["currency_code"] == "XCG"
    assert isinstance(rows[march_id]["balance_due"], str)
    assert rows[may_id]["tax_due"] == "10.00"
    assert rows[may_id]["amount_paid"] == "10.00"
    assert rows[may_id]["balance_due"] == "0.00"
    assert Decimal(body["tax_due"]) == sum(Decimal(row["tax_due"]) for row in body["returns"])
    assert Decimal(body["amount_paid"]) == sum(Decimal(row["amount_paid"]) for row in body["returns"])
    assert Decimal(body["balance_due"]) == sum(Decimal(row["balance_due"]) for row in body["returns"])
    assert "210.00" not in (rows[march_id]["tax_due"], rows[march_id]["balance_due"])


@pytest.mark.asyncio
async def test_another_firm_cannot_read_the_balances(client: TestClient, database_url: str) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    created = client.post(
        "/api/v1/invoices",
        headers=_auth(DEV_KEY),
        json={
            "vendor_name": "March Late",
            "invoice_number": "BAL-LATE",
            "invoice_date": "2026-03-20",
            "tax_year": 2026,
            "country_code": "SXM",
            "lines": [{"description": "Goods", "quantity": "2", "unit_price": "100.00"}],
        },
    )
    assert created.status_code == 201
    filed = _file(client, DEV_KEY, "2026-03-16", "2026-03-31")
    assert filed.status_code == 201
    assert filed.json()["tot_amount"] == "10.00"
    return_id = filed.json()["id"]
    paid = client.post(
        f"/api/v1/tax/tot/returns/{return_id}/payments",
        headers=_auth(DEV_KEY),
        json={"amount": "4.00", "paid_on": "2026-03-25"},
    )
    assert paid.status_code == 201

    _switch(client, DEV_KEY, SIMPSON_BAY)
    sibling = _balances(client, DEV_KEY)
    assert sibling.status_code == 200
    assert return_id not in {row["return_id"] for row in sibling.json()["returns"]}
    assert sibling.json()["tenant_id"] == SIMPSON_BAY

    _switch(client, OTHER_KEY, OTHER_TENANT)
    foreign = _balances(client, OTHER_KEY)
    assert foreign.status_code == 200
    assert foreign.json()["tenant_id"] == OTHER_TENANT
    assert return_id not in {row["return_id"] for row in foreign.json()["returns"]}
    assert foreign.json()["returns"] == []
    assert foreign.json()["tax_due"] == "0.00"
    assert foreign.json()["amount_paid"] == "0.00"
    assert foreign.json()["balance_due"] == "0.00"

    await _assert_balance_rls(database_url, UUID(return_id))


async def _assert_balance_rls(database_url: str, return_id: UUID) -> None:
    repository = TenancyRepository()
    other = await asyncpg.connect(database_url)
    try:
        async with other.transaction():
            user = await repository.resolve_user(other, OTHER_KEY)
            assert user is not None
            await repository.set_user(other, user.id)
            await repository.set_scope(other, master_account_id=OTHER_FIRM, tenant_id=UUID(GREAT_BAY))
            leaked = await other.fetch(
                """
                SELECT returns.id
                FROM allyanna.tot_returns AS returns
                LEFT JOIN allyanna.tot_return_payments AS payments
                  ON payments.tot_return_id = returns.id
                 AND payments.tenant_id = returns.tenant_id
                WHERE returns.tenant_id = current_setting('allyanna.tenant_id', true)::uuid
                GROUP BY returns.id
                """
            )
            assert leaked == []
    finally:
        await other.close()

    demo = await asyncpg.connect(database_url)
    try:
        async with demo.transaction():
            user = await repository.resolve_user(demo, DEV_KEY)
            assert user is not None
            await repository.set_user(demo, user.id)
            await repository.set_scope(demo, master_account_id=HARBOUR, tenant_id=UUID(SIMPSON_BAY))
            assert await demo.fetchval(
                "SELECT id FROM allyanna.tot_returns WHERE id = $1",
                return_id,
            ) is None
            await repository.set_scope(demo, master_account_id=HARBOUR, tenant_id=UUID(GREAT_BAY))
            visible = await demo.fetchval(
                """
                SELECT COALESCE(SUM(payments.amount), 0::numeric)
                FROM allyanna.tot_returns AS returns
                LEFT JOIN allyanna.tot_return_payments AS payments
                  ON payments.tot_return_id = returns.id
                 AND payments.tenant_id = returns.tenant_id
                WHERE returns.id = $1
                  AND returns.tenant_id = current_setting('allyanna.tenant_id', true)::uuid
                """,
                return_id,
            )
            assert Decimal(visible) == Decimal("4.00")
    finally:
        await demo.close()
