"""A refund reduces the amount paid and leaves the original payment stored."""

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
            "vendor_name": "Refund Goods",
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
        },
    )


def _pay(client: TestClient, return_id: str, amount: str, paid_on: str) -> object:
    return client.post(
        f"/api/v1/tax/tot/returns/{return_id}/payments",
        headers=_auth(DEV_KEY),
        json={"amount": amount, "paid_on": paid_on},
    )


def _refund(client: TestClient, key: str, return_id: str, amount: str, refunded_on: str) -> object:
    return client.post(
        f"/api/v1/tax/tot/returns/{return_id}/refunds",
        headers=_auth(key),
        json={"amount": amount, "refunded_on": refunded_on},
    )


def test_a_refund_reduces_amount_paid_and_keeps_the_payment(client: TestClient) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    priced = client.post(
        "/api/v1/tax/tot",
        headers=_auth(DEV_KEY),
        json={"tax_year": 2026, "country_code": "SXM", "gross_taxable_revenue": "200.00"},
    )
    assert priced.status_code == 200
    table_tax = priced.json()["tot_amount"]
    assert table_tax == "10.00"

    created = _invoice(client, "REF-PAY", "2026-07-18")
    assert created.status_code == 201
    assert created.json()["tot_amount"] == table_tax
    filed = _file(client, "2026-07-18", "2026-07-19")
    assert filed.status_code == 201
    assert filed.json()["tot_amount"] == table_tax
    assert filed.json()["due_on"] is None
    return_id = filed.json()["id"]

    paid = _pay(client, return_id, table_tax, "2026-07-18")
    assert paid.status_code == 201
    payment_id = paid.json()["id"]
    assert paid.json()["amount"] == table_tax
    assert paid.json()["amount_paid"] == table_tax
    assert paid.json()["balance_due"] == "0.00"

    refunded = _refund(client, DEV_KEY, return_id, "4.00", "2026-07-19")
    assert refunded.status_code == 201
    body = refunded.json()
    refund_id = body["id"]
    assert body["amount"] == "4.00"
    assert body["tot_return_id"] == return_id
    assert Decimal(body["amount_paid"]) == Decimal(table_tax) - Decimal(body["amount"])
    assert body["amount_paid"] == "6.00"
    assert body["balance_due"] == "4.00"
    assert body["tax_due"] == table_tax
    assert isinstance(body["amount"], str)

    original = client.get(f"/api/v1/tax/tot/payments/{payment_id}", headers=_auth(DEV_KEY))
    assert original.status_code == 200
    assert original.json()["amount"] == table_tax
    assert original.json()["amount_paid"] == "6.00"
    listed = client.get(f"/api/v1/tax/tot/returns/{return_id}/payments", headers=_auth(DEV_KEY))
    assert listed.status_code == 200
    assert listed.json()["amount_paid"] == "6.00"
    assert payment_id in {item["id"] for item in listed.json()["payments"]}
    assert listed.json()["payments"][0]["amount"] == table_tax
    refunds = client.get(f"/api/v1/tax/tot/returns/{return_id}/refunds", headers=_auth(DEV_KEY))
    assert refunds.status_code == 200
    assert [item["id"] for item in refunds.json()["refunds"]] == [refund_id]
    fetched = client.get(f"/api/v1/tax/tot/refunds/{refund_id}", headers=_auth(DEV_KEY))
    assert fetched.status_code == 200
    assert fetched.json()["amount"] == "4.00"

    too_much = _refund(client, DEV_KEY, return_id, "7.00", "2026-07-19")
    assert too_much.status_code == 422
    assert too_much.json()["code"] == "invalid_payment"
    zero = _refund(client, DEV_KEY, return_id, "0.00", "2026-07-19")
    assert zero.status_code == 422
    assert zero.json()["code"] == "invalid_payment"

    again = _pay(client, return_id, "4.00", "2026-07-19")
    assert again.status_code == 201
    assert again.json()["amount_paid"] == table_tax
    assert again.json()["balance_due"] == "0.00"
    stored = client.get(f"/api/v1/tax/tot/payments/{payment_id}", headers=_auth(DEV_KEY))
    assert stored.status_code == 200
    assert stored.json()["amount"] == table_tax
    payments = client.get(f"/api/v1/tax/tot/returns/{return_id}/payments", headers=_auth(DEV_KEY))
    assert {item["id"] for item in payments.json()["payments"]} == {payment_id, again.json()["id"]}

    balances = client.get("/api/v1/tax/tot/balances", headers=_auth(DEV_KEY))
    assert balances.status_code == 200
    row = next(item for item in balances.json()["returns"] if item["return_id"] == return_id)
    assert row["amount_paid"] == table_tax
    assert row["balance_due"] == "0.00"
    assert row["past_due"] is False

    _switch(client, DEV_KEY, SIMPSON_BAY)
    sibling = client.get(f"/api/v1/tax/tot/refunds/{refund_id}", headers=_auth(DEV_KEY))
    sibling_post = _refund(client, DEV_KEY, return_id, "1.00", "2026-07-19")
    assert sibling.status_code == 404
    assert sibling.json()["code"] == "tot_refund_not_found"
    assert sibling_post.status_code == 404
    assert sibling_post.json()["code"] == "tot_return_not_found"

    _switch(client, OTHER_KEY, OTHER_TENANT)
    foreign = client.get(f"/api/v1/tax/tot/refunds/{refund_id}", headers=_auth(OTHER_KEY))
    foreign_post = _refund(client, OTHER_KEY, return_id, "1.00", "2026-07-19")
    foreign_list = client.get(f"/api/v1/tax/tot/returns/{return_id}/refunds", headers=_auth(OTHER_KEY))
    assert foreign.status_code == 404
    assert foreign.json()["code"] == "tot_refund_not_found"
    assert foreign_post.status_code == 404
    assert foreign_list.status_code == 404


def test_a_refund_follows_the_latest_filing(client: TestClient) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    created = _invoice(client, "REF-CHAIN", "2026-04-29")
    assert created.status_code == 201
    filed = _file(client, "2026-04-29", "2026-04-30")
    assert filed.status_code == 201
    original_id = filed.json()["id"]
    paid = _pay(client, original_id, "6.00", "2026-04-29")
    assert paid.status_code == 201
    payment_id = paid.json()["id"]
    amended = client.post(
        f"/api/v1/tax/tot/returns/{original_id}/amendments",
        headers=_auth(DEV_KEY),
        json={},
    )
    assert amended.status_code == 201
    latest_id = amended.json()["id"]
    assert amended.json()["tot_amount"] == "10.00"
    assert amended.json()["due_on"] is None

    stale = _refund(client, DEV_KEY, original_id, "1.00", "2026-04-30")
    assert stale.status_code == 409
    assert stale.json()["code"] == "tot_return_superseded"

    refunded = _refund(client, DEV_KEY, latest_id, "2.00", "2026-04-30")
    assert refunded.status_code == 201
    assert refunded.json()["tot_return_id"] == latest_id
    assert Decimal(refunded.json()["amount_paid"]) == Decimal("6.00") - Decimal("2.00")
    assert refunded.json()["amount_paid"] == "4.00"
    assert refunded.json()["balance_due"] == "6.00"

    original = client.get(f"/api/v1/tax/tot/payments/{payment_id}", headers=_auth(DEV_KEY))
    assert original.status_code == 200
    assert original.json()["amount"] == "6.00"
    assert original.json()["tot_return_id"] == original_id
    assert original.json()["amount_paid"] == "4.00"

    balances = client.get(
        "/api/v1/tax/tot/balances",
        headers=_auth(DEV_KEY),
        params={"as_of": "2026-05-01"},
    )
    assert balances.status_code == 200
    rows = {row["return_id"]: row for row in balances.json()["returns"]}
    assert original_id not in rows
    assert rows[latest_id]["amount_paid"] == "4.00"
    assert rows[latest_id]["balance_due"] == "6.00"
    assert rows[latest_id]["past_due"] is False


@pytest.mark.asyncio
async def test_another_firm_cannot_read_the_refund(client: TestClient, database_url: str) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    created = _invoice(client, "REF-RLS", "2026-07-17")
    assert created.status_code == 201
    filed = _file(client, "2026-07-17", "2026-07-17")
    assert filed.status_code == 201
    return_id = UUID(filed.json()["id"])
    paid = _pay(client, str(return_id), "4.00", "2026-07-17")
    assert paid.status_code == 201
    payment_id = UUID(paid.json()["id"])
    refunded = _refund(client, DEV_KEY, str(return_id), "1.00", "2026-07-17")
    assert refunded.status_code == 201
    refund_id = UUID(refunded.json()["id"])

    repository = TenancyRepository()
    other = await asyncpg.connect(database_url)
    try:
        async with other.transaction():
            user = await repository.resolve_user(other, OTHER_KEY)
            assert user is not None
            await repository.set_user(other, user.id)
            await repository.set_scope(other, master_account_id=OTHER_FIRM, tenant_id=UUID(GREAT_BAY))
            assert await other.fetch(
                "SELECT id FROM allyanna.tot_return_refunds WHERE id = $1",
                refund_id,
            ) == []
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            async with other.transaction():
                user = await repository.resolve_user(other, OTHER_KEY)
                assert user is not None
                await repository.set_user(other, user.id)
                await repository.set_scope(other, master_account_id=OTHER_FIRM, tenant_id=UUID(GREAT_BAY))
                await other.execute(
                    """
                    INSERT INTO allyanna.tot_return_refunds (
                      tenant_id, tot_return_id, amount, refunded_on
                    )
                    VALUES (
                      current_setting('allyanna.tenant_id', true)::uuid,
                      $1, 1.00, DATE '2026-07-17'
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
                    INSERT INTO allyanna.tot_return_refunds (
                      tenant_id, tot_return_id, amount, refunded_on
                    )
                    VALUES (
                      current_setting('allyanna.tenant_id', true)::uuid,
                      $1, 1.00, DATE '2026-07-17'
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
                "SELECT id FROM allyanna.tot_return_refunds WHERE id = $1",
                refund_id,
            ) is None
            await repository.set_scope(demo, master_account_id=HARBOUR, tenant_id=UUID(GREAT_BAY))
            visible = await demo.fetchval(
                "SELECT amount FROM allyanna.tot_return_refunds WHERE id = $1",
                refund_id,
            )
            assert Decimal(visible) == Decimal("1.00")
            payment_amount = await demo.fetchval(
                "SELECT amount FROM allyanna.tot_return_payments WHERE id = $1",
                payment_id,
            )
            assert Decimal(payment_amount) == Decimal("4.00")
    finally:
        await demo.close()
