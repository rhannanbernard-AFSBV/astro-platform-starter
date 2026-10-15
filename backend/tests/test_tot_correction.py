"""One correcting invoice can enter a filed period. An ordinary invoice cannot."""

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


def _invoice(
    client: TestClient,
    key: str,
    number: str,
    invoice_date: str,
    corrects_return_id: str | None = None,
) -> object:
    body: dict[str, object] = {
        "vendor_name": "Late July Goods",
        "invoice_number": number,
        "invoice_date": invoice_date,
        "tax_year": 2026,
        "country_code": "SXM",
        "lines": [{"description": "Goods", "quantity": "2", "unit_price": "100.00"}],
    }
    if corrects_return_id is not None:
        body["corrects_return_id"] = corrects_return_id
    return client.post("/api/v1/invoices", headers=_auth(key), json=body)


def test_a_correcting_invoice_enters_a_filed_period(client: TestClient) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    priced = client.post(
        "/api/v1/tax/tot",
        headers=_auth(DEV_KEY),
        json={"tax_year": 2026, "country_code": "SXM", "gross_taxable_revenue": "200.00"},
    )
    assert priced.status_code == 200
    table_tax = priced.json()["tot_amount"]
    assert table_tax == "10.00"

    original = _invoice(client, DEV_KEY, "COR-BASE", "2026-07-28")
    assert original.status_code == 201
    assert original.json()["tot_amount"] == table_tax
    assert original.json()["subtotal"] == "200.00"
    assert original.json()["grand_total"] == "210.00"
    assert original.json()["corrects_return_id"] is None

    filed = client.post(
        "/api/v1/tax/tot/returns",
        headers=_auth(DEV_KEY),
        json={
            "period_start": "2026-07-26",
            "period_end": "2026-07-31",
            "tax_year": 2026,
            "country_code": "SXM",
        },
    )
    assert filed.status_code == 201
    frozen = filed.json()
    assert frozen["tot_amount"] == table_tax
    assert frozen["due_on"] is None
    assert frozen["invoice_count"] == 1
    return_id = frozen["id"]

    ordinary = _invoice(client, DEV_KEY, "COR-ORD", "2026-07-29")
    assert ordinary.status_code == 409
    assert ordinary.json()["code"] == "invoice_period_filed"

    accepted = _invoice(client, DEV_KEY, "COR-FIX", "2026-07-29", return_id)
    assert accepted.status_code == 201
    correction = accepted.json()
    assert correction["corrects_return_id"] == return_id
    assert correction["tot_amount"] == table_tax
    assert correction["subtotal"] == "200.00"
    assert correction["invoice_date"] == "2026-07-29"
    correction_id = correction["id"]
    fetched = client.get(f"/api/v1/invoices/{correction_id}", headers=_auth(DEV_KEY))
    assert fetched.status_code == 200
    assert fetched.json()["corrects_return_id"] == return_id

    duplicate = _invoice(client, DEV_KEY, "COR-AGAIN", "2026-07-30", return_id)
    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "correcting_invoice_exists"
    still_blocked = _invoice(client, DEV_KEY, "COR-STILL", "2026-07-30")
    assert still_blocked.status_code == 409
    assert still_blocked.json()["code"] == "invoice_period_filed"
    outside = _invoice(client, DEV_KEY, "COR-OUT", "2026-07-25", return_id)
    assert outside.status_code == 422
    assert outside.json()["code"] == "invalid_invoice"

    stored = client.get(f"/api/v1/tax/tot/returns/{return_id}", headers=_auth(DEV_KEY))
    assert stored.status_code == 200
    assert stored.json()["tot_amount"] == table_tax
    assert stored.json()["superseded"] is False

    amended = client.post(
        f"/api/v1/tax/tot/returns/{return_id}/amendments",
        headers=_auth(DEV_KEY),
        json={},
    )
    assert amended.status_code == 201
    latest = amended.json()
    combined = Decimal(table_tax) + Decimal(correction["tot_amount"])
    assert Decimal(latest["tot_amount"]) == combined
    assert latest["tot_amount"] == "20.00"
    assert latest["subtotal"] == "400.00"
    assert latest["invoice_count"] == 2
    assert latest["amends_return_id"] == return_id
    assert latest["due_on"] is None
    original_after = client.get(f"/api/v1/tax/tot/returns/{return_id}", headers=_auth(DEV_KEY))
    assert original_after.status_code == 200
    assert original_after.json()["tot_amount"] == table_tax
    assert original_after.json()["superseded"] is True

    stale = _invoice(client, DEV_KEY, "COR-STALE", "2026-07-30", return_id)
    assert stale.status_code == 409
    assert stale.json()["code"] == "tot_return_superseded"

    _switch(client, DEV_KEY, SIMPSON_BAY)
    sibling_post = _invoice(client, DEV_KEY, "COR-SIB", "2026-07-29", return_id)
    sibling_read = client.get(f"/api/v1/invoices/{correction_id}", headers=_auth(DEV_KEY))
    sibling_list = client.get("/api/v1/invoices", headers=_auth(DEV_KEY))
    assert sibling_post.status_code == 404
    assert sibling_post.json()["code"] == "tot_return_not_found"
    assert sibling_read.status_code == 404
    assert sibling_read.json()["code"] == "invoice_not_found"
    assert correction_id not in {item["id"] for item in sibling_list.json()["invoices"]}

    _switch(client, OTHER_KEY, OTHER_TENANT)
    foreign_post = _invoice(client, OTHER_KEY, "COR-FIRM", "2026-07-29", return_id)
    foreign_read = client.get(f"/api/v1/invoices/{correction_id}", headers=_auth(OTHER_KEY))
    foreign_list = client.get("/api/v1/invoices", headers=_auth(OTHER_KEY))
    assert foreign_post.status_code == 404
    assert foreign_post.json()["code"] == "tot_return_not_found"
    assert foreign_read.status_code == 404
    assert foreign_read.json()["code"] == "invoice_not_found"
    assert correction_id not in {item["id"] for item in foreign_list.json()["invoices"]}


@pytest.mark.asyncio
async def test_another_firm_cannot_post_or_read_the_correcting_invoice(
    client: TestClient,
    database_url: str,
) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    created = _invoice(client, DEV_KEY, "COR-RLS", "2026-03-15")
    assert created.status_code == 201
    filed = client.post(
        "/api/v1/tax/tot/returns",
        headers=_auth(DEV_KEY),
        json={
            "period_start": "2026-03-15",
            "period_end": "2026-03-15",
            "tax_year": 2026,
            "country_code": "SXM",
        },
    )
    assert filed.status_code == 201
    assert filed.json()["due_on"] is None
    return_id = UUID(filed.json()["id"])
    blocked = _invoice(client, DEV_KEY, "COR-RLS-ORD", "2026-03-15")
    assert blocked.status_code == 409
    assert blocked.json()["code"] == "invoice_period_filed"
    accepted = _invoice(client, DEV_KEY, "COR-RLS-FIX", "2026-03-15", str(return_id))
    assert accepted.status_code == 201
    invoice_id = UUID(accepted.json()["id"])
    assert accepted.json()["corrects_return_id"] == str(return_id)

    repository = TenancyRepository()
    other = await asyncpg.connect(database_url)
    try:
        async with other.transaction():
            user = await repository.resolve_user(other, OTHER_KEY)
            assert user is not None
            await repository.set_user(other, user.id)
            await repository.set_scope(other, master_account_id=OTHER_FIRM, tenant_id=UUID(GREAT_BAY))
            assert await other.fetch(
                "SELECT id FROM allyanna.invoices WHERE id = $1",
                invoice_id,
            ) == []
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            async with other.transaction():
                user = await repository.resolve_user(other, OTHER_KEY)
                assert user is not None
                await repository.set_user(other, user.id)
                await repository.set_scope(other, master_account_id=OTHER_FIRM, tenant_id=UUID(GREAT_BAY))
                await other.execute(
                    """
                    INSERT INTO allyanna.invoices (
                      tenant_id, vendor_name, invoice_date, currency_code, tax_year,
                      country_code, tax_schedule_id, subtotal, tot_rate, tot_amount,
                      grand_total, corrects_return_id
                    )
                    VALUES (
                      current_setting('allyanna.tenant_id', true)::uuid,
                      'Foreign', DATE '2026-03-15', 'XCG', 2026, 'SXM',
                      $1::uuid, 1.00, 0.01000000, 0.01, 1.01, $2
                    )
                    """,
                    UUID(TOT_SCHEDULE),
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
                    INSERT INTO allyanna.invoices (
                      tenant_id, vendor_name, invoice_date, currency_code, tax_year,
                      country_code, tax_schedule_id, subtotal, tot_rate, tot_amount,
                      grand_total, corrects_return_id
                    )
                    VALUES (
                      current_setting('allyanna.tenant_id', true)::uuid,
                      'Foreign', DATE '2026-03-15', 'XCG', 2026, 'SXM',
                      $1::uuid, 1.00, 0.01000000, 0.01, 1.01, $2
                    )
                    """,
                    UUID(TOT_SCHEDULE),
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
                "SELECT id FROM allyanna.invoices WHERE id = $1",
                invoice_id,
            ) is None
            await repository.set_scope(demo, master_account_id=HARBOUR, tenant_id=UUID(GREAT_BAY))
            visible = await demo.fetchval(
                "SELECT corrects_return_id FROM allyanna.invoices WHERE id = $1",
                invoice_id,
            )
            assert visible == return_id
    finally:
        await demo.close()
