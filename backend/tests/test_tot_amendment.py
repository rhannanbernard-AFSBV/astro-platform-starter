"""An amendment supersedes the frozen tax. The earlier filing stays readable."""

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


def _invoice(client: TestClient, number: str, invoice_date: str) -> object:
    return client.post(
        "/api/v1/invoices",
        headers=_auth(DEV_KEY),
        json={
            "vendor_name": "April Correction",
            "invoice_number": number,
            "invoice_date": invoice_date,
            "tax_year": 2026,
            "country_code": "SXM",
            "lines": [{"description": "Goods", "quantity": "2", "unit_price": "100.00"}],
        },
    )


def _file(client: TestClient, start: str, end: str) -> object:
    return client.post(
        "/api/v1/tax/tot/returns",
        headers=_auth(DEV_KEY),
        json={
            "period_start": start,
            "period_end": end,
            "tax_year": 2026,
            "country_code": "SXM",
            "due_on": "2026-12-31",
        },
    )


def _amend(client: TestClient, key: str, return_id: str) -> object:
    return client.post(
        f"/api/v1/tax/tot/returns/{return_id}/amendments",
        headers=_auth(key),
        json={},
    )


def test_amendment_supersedes_the_frozen_tax_and_keeps_the_original(
    client: TestClient,
    admin_sql,
) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    created = _invoice(client, "AMD-200", "2026-04-17")
    assert created.status_code == 201
    invoice_id = created.json()["id"]
    filed = _file(client, "2026-04-16", "2026-04-19")
    assert filed.status_code == 201
    original = filed.json()
    assert original["tot_amount"] == "10.00"
    assert original["superseded"] is False
    assert original["amends_return_id"] is None
    original_id = original["id"]
    original_rate = original["rate"]

    paid = client.post(
        f"/api/v1/tax/tot/returns/{original_id}/payments",
        headers=_auth(DEV_KEY),
        json={"amount": "4.00", "paid_on": "2026-04-18"},
    )
    assert paid.status_code == 201
    assert paid.json()["balance_due"] == "6.00"

    admin_sql(
        "UPDATE allyanna.invoices "
        "SET tot_amount = 15.00, grand_total = 215.00 "
        f"WHERE id = '{invoice_id}'"
    )
    amended = _amend(client, DEV_KEY, original_id)
    assert amended.status_code == 201
    correction = amended.json()
    assert correction["amends_return_id"] == original_id
    assert correction["superseded"] is False
    assert correction["tot_amount"] == "15.00"
    assert correction["subtotal"] == "200.00"
    assert correction["rate"] == original_rate
    assert correction["due_on"] == "2026-12-31"
    assert correction["period_start"] == "2026-04-16"
    correction_id = correction["id"]

    stored = client.get(f"/api/v1/tax/tot/returns/{original_id}", headers=_auth(DEV_KEY))
    assert stored.status_code == 200
    assert stored.json()["tot_amount"] == "10.00"
    assert stored.json()["superseded"] is True
    assert stored.json()["rate"] == original_rate
    listed = client.get("/api/v1/tax/tot/returns", headers=_auth(DEV_KEY))
    assert original_id in {item["id"] for item in listed.json()["returns"]}
    assert correction_id in {item["id"] for item in listed.json()["returns"]}

    balances = client.get(
        "/api/v1/tax/tot/balances",
        headers=_auth(DEV_KEY),
        params={"as_of": "2027-01-01"},
    )
    assert balances.status_code == 200
    rows = {row["return_id"]: row for row in balances.json()["returns"]}
    assert original_id not in rows
    assert rows[correction_id]["tax_due"] == "15.00"
    assert rows[correction_id]["amount_paid"] == "4.00"
    assert rows[correction_id]["balance_due"] == "11.00"
    assert rows[correction_id]["past_due"] is True

    again = _amend(client, DEV_KEY, original_id)
    assert again.status_code == 409
    assert again.json()["code"] == "tot_return_superseded"
    duplicate = _file(client, "2026-04-16", "2026-04-19")
    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "tot_return_already_filed"

    stale = client.post(
        f"/api/v1/tax/tot/returns/{original_id}/payments",
        headers=_auth(DEV_KEY),
        json={"amount": "1.00", "paid_on": "2026-04-19"},
    )
    assert stale.status_code == 409
    assert stale.json()["code"] == "tot_return_superseded"
    rest = client.post(
        f"/api/v1/tax/tot/returns/{correction_id}/payments",
        headers=_auth(DEV_KEY),
        json={"amount": "11.00", "paid_on": "2026-04-28"},
    )
    assert rest.status_code == 201
    assert rest.json()["tax_due"] == "15.00"
    assert rest.json()["amount_paid"] == "15.00"
    assert rest.json()["balance_due"] == "0.00"

    _switch(client, DEV_KEY, SIMPSON_BAY)
    sibling = client.get(f"/api/v1/tax/tot/returns/{correction_id}", headers=_auth(DEV_KEY))
    sibling_amend = _amend(client, DEV_KEY, correction_id)
    assert sibling.status_code == 404
    assert sibling.json()["code"] == "tot_return_not_found"
    assert sibling_amend.status_code == 404

    _switch(client, OTHER_KEY, OTHER_TENANT)
    foreign = client.get(f"/api/v1/tax/tot/returns/{original_id}", headers=_auth(OTHER_KEY))
    foreign_amend = _amend(client, OTHER_KEY, correction_id)
    foreign_balances = client.get("/api/v1/tax/tot/balances", headers=_auth(OTHER_KEY))
    assert foreign.status_code == 404
    assert foreign_amend.status_code == 404
    assert foreign_amend.json()["code"] == "tot_return_not_found"
    assert correction_id not in {row["return_id"] for row in foreign_balances.json()["returns"]}


def test_amendment_cannot_drop_the_tax_below_the_amount_paid(
    client: TestClient,
    admin_sql,
) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    created = _invoice(client, "AMD-SMALL", "2026-04-07")
    assert created.status_code == 201
    filed = _file(client, "2026-04-06", "2026-04-09")
    assert filed.status_code == 201
    assert filed.json()["tot_amount"] == "10.00"
    return_id = filed.json()["id"]
    paid = client.post(
        f"/api/v1/tax/tot/returns/{return_id}/payments",
        headers=_auth(DEV_KEY),
        json={"amount": "6.00", "paid_on": "2026-04-08"},
    )
    assert paid.status_code == 201
    admin_sql(
        "UPDATE allyanna.invoices "
        "SET tot_amount = 5.00, grand_total = 205.00 "
        f"WHERE id = '{created.json()['id']}'"
    )
    rejected = _amend(client, DEV_KEY, return_id)
    assert rejected.status_code == 422
    assert rejected.json()["code"] == "invalid_payment"
    stored = client.get(f"/api/v1/tax/tot/returns/{return_id}", headers=_auth(DEV_KEY))
    assert stored.status_code == 200
    assert stored.json()["tot_amount"] == "10.00"
    assert stored.json()["superseded"] is False


@pytest.mark.asyncio
async def test_another_firm_cannot_amend_the_return(client: TestClient, database_url: str) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    created = _invoice(client, "AMD-FIRM", "2026-04-03")
    assert created.status_code == 201
    filed = _file(client, "2026-04-03", "2026-04-05")
    assert filed.status_code == 201
    return_id = UUID(filed.json()["id"])

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
                      subtotal, tot_amount, grand_total, amends_return_id
                    )
                    VALUES (
                      current_setting('allyanna.tenant_id', true)::uuid,
                      'SXM', 2026, DATE '2026-04-03', DATE '2026-04-05',
                      'XCG', 'a1000000-0000-4000-8000-000000000001',
                      0.01000000, 1, 1.00, 0.01, 1.01, $1
                    )
                    """,
                    return_id,
                )
        with pytest.raises(asyncpg.RaiseError, match="does not belong"):
            async with other.transaction():
                user = await repository.resolve_user(other, OTHER_KEY)
                assert user is not None
                await repository.set_user(other, user.id)
                await repository.set_scope(other, master_account_id=OTHER_FIRM, tenant_id=UUID(OTHER_TENANT))
                await other.execute(
                    """
                    INSERT INTO allyanna.tot_returns (
                      tenant_id, country_code, tax_year, period_start, period_end,
                      currency_code, tax_schedule_id, rate, invoice_count,
                      subtotal, tot_amount, grand_total, amends_return_id
                    )
                    VALUES (
                      current_setting('allyanna.tenant_id', true)::uuid,
                      'SXM', 2026, DATE '2026-04-03', DATE '2026-04-05',
                      'XCG', 'a1000000-0000-4000-8000-000000000001',
                      0.01000000, 1, 1.00, 0.01, 1.01, $1
                    )
                    """,
                    return_id,
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
                "SELECT tot_amount FROM allyanna.tot_returns WHERE id = $1",
                return_id,
            )
            assert Decimal(visible) == Decimal("10.00")
    finally:
        await demo.close()
