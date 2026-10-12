"""Filing a worksheet stores the period sums and the table rate."""

import json
from datetime import date
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
TOT_SCHEDULE = "a1000000-0000-4000-8000-000000000001"
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


def test_filing_requires_a_business_profile(client: TestClient, admin_sql) -> None:
    admin_sql(f"DELETE FROM allyanna.user_active_contexts WHERE user_id = '{DEMO_USER}'")
    missing = _file(client, DEV_KEY, "2026-10-01", "2026-10-31")
    assert missing.status_code == 409
    assert missing.json()["code"] == "tenant_context_required"


def test_filed_return_freezes_the_summed_tax_and_the_table_rate(
    client: TestClient,
    admin_sql,
) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    goods = client.post(
        "/api/v1/invoices",
        headers=_auth(DEV_KEY),
        json={
            "vendor_name": "October Goods",
            "invoice_number": "RET-200",
            "invoice_date": "2026-10-05",
            "tax_year": 2026,
            "country_code": "SXM",
            "lines": [{"description": "Goods", "quantity": "2", "unit_price": "100.00"}],
        },
    )
    oil = client.post(
        "/api/v1/invoices",
        headers=_auth(DEV_KEY),
        json={
            "vendor_name": "October Oil",
            "invoice_number": "RET-OIL",
            "invoice_date": "2026-10-20",
            "tax_year": 2026,
            "country_code": "SXM",
            "lines": [{"description": "Oil", "quantity": "1.5", "unit_price": "10.00"}],
        },
    )
    assert goods.status_code == 201
    assert oil.status_code == 201
    admin_sql(
        "UPDATE allyanna.tot_rates SET rate = 0.07000000 "
        f"WHERE tax_schedule_id = '{TOT_SCHEDULE}'"
    )
    try:
        filed = _file(client, DEV_KEY, "2026-10-01", "2026-10-31")
        assert filed.status_code == 201
        body = filed.json()
        assert body["tenant_id"] == GREAT_BAY
        assert body["invoice_count"] == 2
        assert body["subtotal"] == "215.00"
        assert body["rate"] == "0.07"
        assert body["tot_amount"] == "10.75"
        assert body["grand_total"] == "225.75"
        assert body["currency_code"] == "XCG"
        assert isinstance(body["tot_amount"], str)
        assert "15.05" not in json.dumps(body)
        return_id = body["id"]
    finally:
        admin_sql(
            "UPDATE allyanna.tot_rates SET rate = 0.05000000 "
            f"WHERE tax_schedule_id = '{TOT_SCHEDULE}'"
        )

    stored = client.get(f"/api/v1/tax/tot/returns/{return_id}", headers=_auth(DEV_KEY))
    assert stored.status_code == 200
    assert stored.json()["rate"] == "0.07"
    assert stored.json()["subtotal"] == "215.00"
    assert stored.json()["tot_amount"] == "10.75"
    listed = client.get("/api/v1/tax/tot/returns", headers=_auth(DEV_KEY))
    assert listed.status_code == 200
    assert return_id in {item["id"] for item in listed.json()["returns"]}

    again = _file(client, DEV_KEY, "2026-10-01", "2026-10-31")
    assert again.status_code == 409
    assert again.json()["code"] == "tot_return_already_filed"

    nil = _file(client, DEV_KEY, "2026-02-01", "2026-02-28")
    assert nil.status_code == 201
    assert nil.json()["invoice_count"] == 0
    assert nil.json()["subtotal"] == "0.00"
    assert nil.json()["tot_amount"] == "0.00"
    assert nil.json()["rate"] == "0.05"


@pytest.mark.asyncio
async def test_another_firm_cannot_read_the_filing(client: TestClient, database_url: str) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    created = client.post(
        "/api/v1/invoices",
        headers=_auth(DEV_KEY),
        json={
            "vendor_name": "November Goods",
            "invoice_number": "RET-NOV",
            "invoice_date": "2026-11-12",
            "tax_year": 2026,
            "country_code": "SXM",
            "lines": [{"description": "Goods", "quantity": "2", "unit_price": "100.00"}],
        },
    )
    assert created.status_code == 201
    filed = _file(client, DEV_KEY, "2026-11-01", "2026-11-30")
    assert filed.status_code == 201
    body = filed.json()
    assert body["subtotal"] == "200.00"
    assert body["tot_amount"] == "10.00"
    assert body["rate"] == "0.05"
    return_id = body["id"]

    _switch(client, DEV_KEY, SIMPSON_BAY)
    sibling = client.get(f"/api/v1/tax/tot/returns/{return_id}", headers=_auth(DEV_KEY))
    sibling_list = client.get("/api/v1/tax/tot/returns", headers=_auth(DEV_KEY))
    assert sibling.status_code == 404
    assert sibling.json()["code"] == "tot_return_not_found"
    assert return_id not in {item["id"] for item in sibling_list.json()["returns"]}

    _switch(client, OTHER_KEY, OTHER_TENANT)
    foreign = client.get(f"/api/v1/tax/tot/returns/{return_id}", headers=_auth(OTHER_KEY))
    foreign_list = client.get("/api/v1/tax/tot/returns", headers=_auth(OTHER_KEY))
    assert foreign.status_code == 404
    assert foreign.json()["code"] == "tot_return_not_found"
    assert foreign_list.json()["returns"] == []

    await _assert_return_rls(database_url, UUID(return_id))


async def _assert_return_rls(database_url: str, return_id: UUID) -> None:
    repository = TenancyRepository()
    other = await asyncpg.connect(database_url)
    try:
        async with other.transaction():
            user = await repository.resolve_user(other, OTHER_KEY)
            assert user is not None
            await repository.set_user(other, user.id)
            await repository.set_scope(other, master_account_id=OTHER_FIRM, tenant_id=UUID(GREAT_BAY))
            assert await other.fetch(
                "SELECT id FROM allyanna.tot_returns WHERE id = $1",
                return_id,
            ) == []
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            async with other.transaction():
                user = await repository.resolve_user(other, OTHER_KEY)
                assert user is not None
                await repository.set_user(other, user.id)
                await repository.set_scope(other, master_account_id=OTHER_FIRM, tenant_id=UUID(GREAT_BAY))
                await other.execute(
                    """
                    INSERT INTO allyanna.tot_returns (
                      tenant_id, country_code, tax_year, period_start, period_end,
                      currency_code, tax_schedule_id, rate, invoice_count,
                      subtotal, tot_amount, grand_total
                    )
                    VALUES (
                      current_setting('allyanna.tenant_id', true)::uuid,
                      'SXM', 2026, DATE '2026-11-01', DATE '2026-11-30',
                      'XCG', 'a1000000-0000-4000-8000-000000000001',
                      0.01000000, 1, 1.00, 0.01, 1.01
                    )
                    """
                )
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
                "SELECT subtotal FROM allyanna.tot_returns WHERE id = $1",
                return_id,
            )
            assert Decimal(visible) == Decimal("200.00")
    finally:
        await demo.close()
