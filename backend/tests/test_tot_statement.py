"""The latest filing's statement lists payments and refunds with a running balance."""

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
            "vendor_name": "Statement Goods",
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


def _statement(client: TestClient, key: str, return_id: str) -> object:
    return client.get(
        f"/api/v1/tax/tot/returns/{return_id}/statement",
        headers=_auth(key),
    )


def _apply(balance: Decimal, line: dict[str, object]) -> Decimal:
    amount = Decimal(str(line["amount"]))
    if line["kind"] == "payment":
        return balance - amount
    return balance + amount


def test_the_statement_lists_payments_and_refunds_in_date_order(client: TestClient) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    priced = client.post(
        "/api/v1/tax/tot",
        headers=_auth(DEV_KEY),
        json={"tax_year": 2026, "country_code": "SXM", "gross_taxable_revenue": "200.00"},
    )
    assert priced.status_code == 200
    table_tax = priced.json()["tot_amount"]
    assert table_tax == "10.00"

    created = _invoice(client, "STMT-PAY", "2026-04-15")
    assert created.status_code == 201
    filed = _file(client, "2026-04-15", "2026-04-15")
    assert filed.status_code == 201
    assert filed.json()["tot_amount"] == table_tax
    assert filed.json()["due_on"] is None
    return_id = filed.json()["id"]

    empty = _statement(client, DEV_KEY, return_id)
    assert empty.status_code == 200
    assert empty.json()["lines"] == []
    assert empty.json()["tax_due"] == table_tax
    assert empty.json()["amount_paid"] == "0.00"
    assert empty.json()["balance_due"] == table_tax

    first = _pay(client, return_id, table_tax, "2026-04-15")
    assert first.status_code == 201
    refunded = _refund(client, DEV_KEY, return_id, "4.00", "2026-04-16")
    assert refunded.status_code == 201
    second = _pay(client, return_id, "4.00", "2026-04-16")
    assert second.status_code == 201

    statement = _statement(client, DEV_KEY, return_id)
    assert statement.status_code == 200
    body = statement.json()
    assert body["tot_return_id"] == return_id
    assert body["tenant_id"] == GREAT_BAY
    assert body["tax_due"] == table_tax
    assert body["amount_paid"] == table_tax
    assert body["balance_due"] == "0.00"
    lines = body["lines"]
    assert [line["kind"] for line in lines] == ["payment", "refund", "payment"]
    assert [line["entry_date"] for line in lines] == ["2026-04-15", "2026-04-16", "2026-04-16"]
    assert [line["id"] for line in lines] == [first.json()["id"], refunded.json()["id"], second.json()["id"]]
    assert lines[0]["amount"] == table_tax
    assert lines[1]["amount"] == "4.00"
    assert lines[2]["amount"] == "4.00"
    running = Decimal(table_tax)
    for line in lines:
        running = _apply(running, line)
        assert Decimal(line["balance"]) == running
        assert isinstance(line["balance"], str)
    assert lines[-1]["balance"] == body["balance_due"]
    assert lines[0]["balance"] == "0.00"
    assert lines[1]["balance"] == "4.00"
    assert lines[2]["balance"] == "0.00"

    stored_payment = client.get(
        f"/api/v1/tax/tot/payments/{first.json()['id']}",
        headers=_auth(DEV_KEY),
    )
    stored_refund = client.get(
        f"/api/v1/tax/tot/refunds/{refunded.json()['id']}",
        headers=_auth(DEV_KEY),
    )
    assert stored_payment.status_code == 200
    assert stored_payment.json()["amount"] == table_tax
    assert stored_refund.status_code == 200
    assert stored_refund.json()["amount"] == "4.00"

    _switch(client, DEV_KEY, SIMPSON_BAY)
    sibling = _statement(client, DEV_KEY, return_id)
    assert sibling.status_code == 404
    assert sibling.json()["code"] == "tot_return_not_found"

    _switch(client, OTHER_KEY, OTHER_TENANT)
    foreign = _statement(client, OTHER_KEY, return_id)
    assert foreign.status_code == 404
    assert foreign.json()["code"] == "tot_return_not_found"


def test_the_statement_follows_the_latest_filing(client: TestClient) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    created = _invoice(client, "STMT-CHAIN", "2026-04-20")
    assert created.status_code == 201
    filed = _file(client, "2026-04-20", "2026-04-20")
    assert filed.status_code == 201
    original_id = filed.json()["id"]
    paid = _pay(client, original_id, "6.00", "2026-04-20")
    assert paid.status_code == 201
    amended = client.post(
        f"/api/v1/tax/tot/returns/{original_id}/amendments",
        headers=_auth(DEV_KEY),
        json={},
    )
    assert amended.status_code == 201
    latest_id = amended.json()["id"]
    assert amended.json()["due_on"] is None
    refunded = _refund(client, DEV_KEY, latest_id, "2.00", "2026-04-21")
    assert refunded.status_code == 201

    stale = _statement(client, DEV_KEY, original_id)
    assert stale.status_code == 409
    assert stale.json()["code"] == "tot_return_superseded"

    statement = _statement(client, DEV_KEY, latest_id)
    assert statement.status_code == 200
    body = statement.json()
    assert body["tot_return_id"] == latest_id
    assert body["tax_due"] == "10.00"
    assert body["amount_paid"] == "4.00"
    assert body["balance_due"] == "6.00"
    lines = body["lines"]
    assert [line["kind"] for line in lines] == ["payment", "refund"]
    assert lines[0]["id"] == paid.json()["id"]
    assert lines[0]["tot_return_id"] == original_id
    assert lines[0]["amount"] == "6.00"
    assert lines[0]["balance"] == "4.00"
    assert lines[1]["id"] == refunded.json()["id"]
    assert lines[1]["tot_return_id"] == latest_id
    assert lines[1]["amount"] == "2.00"
    assert lines[1]["balance"] == "6.00"
    running = Decimal(body["tax_due"])
    for line in lines:
        running = _apply(running, line)
        assert Decimal(line["balance"]) == running

    stored_payment = client.get(
        f"/api/v1/tax/tot/payments/{paid.json()['id']}",
        headers=_auth(DEV_KEY),
    )
    stored_refund = client.get(
        f"/api/v1/tax/tot/refunds/{refunded.json()['id']}",
        headers=_auth(DEV_KEY),
    )
    assert stored_payment.status_code == 200
    assert stored_payment.json()["amount"] == "6.00"
    assert stored_refund.status_code == 200
    assert stored_refund.json()["amount"] == "2.00"


@pytest.mark.asyncio
async def test_another_firm_cannot_read_the_statement(client: TestClient, database_url: str) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    created = _invoice(client, "STMT-RLS", "2026-04-01")
    assert created.status_code == 201
    filed = _file(client, "2026-04-01", "2026-04-01")
    assert filed.status_code == 201
    return_id = filed.json()["id"]
    paid = _pay(client, return_id, "4.00", "2026-04-01")
    assert paid.status_code == 201
    refunded = _refund(client, DEV_KEY, return_id, "1.00", "2026-04-01")
    assert refunded.status_code == 201
    statement = _statement(client, DEV_KEY, return_id)
    assert statement.status_code == 200
    assert [line["kind"] for line in statement.json()["lines"]] == ["payment", "refund"]

    _switch(client, OTHER_KEY, OTHER_TENANT)
    foreign = _statement(client, OTHER_KEY, return_id)
    assert foreign.status_code == 404
    assert foreign.json()["code"] == "tot_return_not_found"

    repository = TenancyRepository()
    other = await asyncpg.connect(database_url)
    try:
        async with other.transaction():
            user = await repository.resolve_user(other, OTHER_KEY)
            assert user is not None
            await repository.set_user(other, user.id)
            await repository.set_scope(other, master_account_id=OTHER_FIRM, tenant_id=UUID(GREAT_BAY))
            assert await other.fetch(
                "SELECT id FROM allyanna.tot_return_payments WHERE tot_return_id = $1",
                UUID(return_id),
            ) == []
            assert await other.fetch(
                "SELECT id FROM allyanna.tot_return_refunds WHERE tot_return_id = $1",
                UUID(return_id),
            ) == []
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
                "SELECT id FROM allyanna.tot_return_payments WHERE id = $1",
                UUID(paid.json()["id"]),
            ) is None
            await repository.set_scope(demo, master_account_id=HARBOUR, tenant_id=UUID(GREAT_BAY))
            payment_amount = await demo.fetchval(
                "SELECT amount FROM allyanna.tot_return_payments WHERE id = $1",
                UUID(paid.json()["id"]),
            )
            refund_amount = await demo.fetchval(
                "SELECT amount FROM allyanna.tot_return_refunds WHERE id = $1",
                UUID(refunded.json()["id"]),
            )
            assert Decimal(payment_amount) == Decimal("4.00")
            assert Decimal(refund_amount) == Decimal("1.00")
    finally:
        await demo.close()
