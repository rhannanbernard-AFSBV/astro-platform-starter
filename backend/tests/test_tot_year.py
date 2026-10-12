"""A year statement lists each latest filing and carries the balance forward."""

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
            "vendor_name": "Year Goods",
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


def _refund(client: TestClient, return_id: str, amount: str, refunded_on: str) -> object:
    return client.post(
        f"/api/v1/tax/tot/returns/{return_id}/refunds",
        headers=_auth(DEV_KEY),
        json={"amount": amount, "refunded_on": refunded_on},
    )


def _year(client: TestClient, key: str, tax_year: int = 2026) -> object:
    return client.get(
        "/api/v1/tax/tot/statements",
        headers=_auth(key),
        params={"tax_year": tax_year, "country_code": "SXM"},
    )


def _apply(balance: Decimal, line: dict[str, object]) -> Decimal:
    amount = Decimal(str(line["amount"]))
    if line["kind"] == "payment":
        return balance - amount
    return balance + amount


def _assert_year_carries(body: dict[str, object]) -> None:
    filings = body["filings"]
    assert isinstance(filings, list)
    previous = Decimal("0")
    tax_due = Decimal("0")
    amount_paid = Decimal("0")
    for filing in filings:
        assert Decimal(filing["opening_balance"]) == previous
        running = previous + Decimal(filing["tax_due"])
        for line in filing["lines"]:
            running = _apply(running, line)
            assert Decimal(line["balance"]) == running
            assert isinstance(line["balance"], str)
        assert Decimal(filing["closing_balance"]) == running
        assert Decimal(filing["closing_balance"]) == previous + Decimal(filing["balance_due"])
        previous = running
        tax_due += Decimal(filing["tax_due"])
        amount_paid += Decimal(filing["amount_paid"])
    assert Decimal(str(body["tax_due"])) == tax_due
    assert Decimal(str(body["amount_paid"])) == amount_paid
    assert Decimal(str(body["balance_due"])) == previous


def test_the_year_statement_carries_each_latest_filing(client: TestClient) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    priced = client.post(
        "/api/v1/tax/tot",
        headers=_auth(DEV_KEY),
        json={"tax_year": 2026, "country_code": "SXM", "gross_taxable_revenue": "200.00"},
    )
    assert priced.status_code == 200
    table_tax = priced.json()["tot_amount"]
    assert table_tax == "10.00"

    empty_year = _year(client, DEV_KEY, 2025)
    assert empty_year.status_code == 200
    assert empty_year.json()["filings"] == []
    assert empty_year.json()["tax_due"] == "0.00"
    assert empty_year.json()["amount_paid"] == "0.00"
    assert empty_year.json()["balance_due"] == "0.00"
    assert empty_year.json()["currency_code"] is None
    assert empty_year.json()["tenant_id"] == GREAT_BAY

    early_invoice = _invoice(client, "YTD-EARLY", "2026-06-02")
    assert early_invoice.status_code == 201
    early = _file(client, "2026-06-02", "2026-06-02")
    assert early.status_code == 201
    assert early.json()["tot_amount"] == table_tax
    assert early.json()["due_on"] is None
    original_id = early.json()["id"]
    paid = _pay(client, original_id, "6.00", "2026-06-02")
    assert paid.status_code == 201
    amended = client.post(
        f"/api/v1/tax/tot/returns/{original_id}/amendments",
        headers=_auth(DEV_KEY),
        json={},
    )
    assert amended.status_code == 201
    latest_id = amended.json()["id"]
    refunded = _refund(client, latest_id, "2.00", "2026-06-03")
    assert refunded.status_code == 201

    late_invoice = _invoice(client, "YTD-LATE", "2026-06-04")
    assert late_invoice.status_code == 201
    late = _file(client, "2026-06-04", "2026-06-04")
    assert late.status_code == 201
    late_id = late.json()["id"]
    late_payment = _pay(client, late_id, "4.00", "2026-06-04")
    assert late_payment.status_code == 201

    statement = _year(client, DEV_KEY)
    assert statement.status_code == 200
    body = statement.json()
    assert body["tax_year"] == 2026
    assert body["country_code"] == "SXM"
    assert body["currency_code"] == "XCG"
    assert body["tenant_id"] == GREAT_BAY
    _assert_year_carries(body)
    ids = [item["return_id"] for item in body["filings"]]
    assert original_id not in ids
    assert ids.index(latest_id) + 1 == ids.index(late_id)
    filings = {item["return_id"]: item for item in body["filings"]}
    early_row = filings[latest_id]
    late_row = filings[late_id]
    assert early_row["period_start"] == "2026-06-02"
    assert early_row["tax_due"] == table_tax
    assert early_row["amount_paid"] == "4.00"
    assert early_row["balance_due"] == "6.00"
    assert early_row["closing_balance"] == late_row["opening_balance"]
    assert [line["kind"] for line in early_row["lines"]] == ["payment", "refund"]
    assert early_row["lines"][0]["id"] == paid.json()["id"]
    assert early_row["lines"][0]["tot_return_id"] == original_id
    assert early_row["lines"][0]["amount"] == "6.00"
    assert early_row["lines"][1]["id"] == refunded.json()["id"]
    assert early_row["lines"][1]["tot_return_id"] == latest_id
    assert early_row["lines"][1]["amount"] == "2.00"
    opening = Decimal(early_row["opening_balance"])
    assert Decimal(early_row["lines"][0]["balance"]) == opening + Decimal(table_tax) - Decimal("6.00")
    assert Decimal(early_row["lines"][1]["balance"]) == opening + Decimal("6.00")
    assert late_row["tax_due"] == table_tax
    assert late_row["amount_paid"] == "4.00"
    assert late_row["balance_due"] == "6.00"
    assert [line["kind"] for line in late_row["lines"]] == ["payment"]
    assert late_row["lines"][0]["amount"] == "4.00"
    assert Decimal(late_row["lines"][0]["balance"]) == Decimal(late_row["opening_balance"]) + Decimal("6.00")

    stored_payment = client.get(f"/api/v1/tax/tot/payments/{paid.json()['id']}", headers=_auth(DEV_KEY))
    stored_refund = client.get(f"/api/v1/tax/tot/refunds/{refunded.json()['id']}", headers=_auth(DEV_KEY))
    assert stored_payment.status_code == 200
    assert stored_payment.json()["amount"] == "6.00"
    assert stored_refund.status_code == 200
    assert stored_refund.json()["amount"] == "2.00"

    _switch(client, DEV_KEY, SIMPSON_BAY)
    sibling = _year(client, DEV_KEY)
    assert sibling.status_code == 200
    assert sibling.json()["tenant_id"] == SIMPSON_BAY
    assert latest_id not in {item["return_id"] for item in sibling.json()["filings"]}
    assert sibling.json()["filings"] == []
    assert sibling.json()["balance_due"] == "0.00"

    _switch(client, OTHER_KEY, OTHER_TENANT)
    foreign = _year(client, OTHER_KEY)
    assert foreign.status_code == 200
    assert foreign.json()["tenant_id"] == OTHER_TENANT
    assert foreign.json()["filings"] == []
    assert foreign.json()["tax_due"] == "0.00"
    assert foreign.json()["amount_paid"] == "0.00"
    assert foreign.json()["balance_due"] == "0.00"


@pytest.mark.asyncio
async def test_another_firm_cannot_read_the_year_statement(client: TestClient, database_url: str) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    created = _invoice(client, "YTD-RLS", "2026-06-06")
    assert created.status_code == 201
    filed = _file(client, "2026-06-06", "2026-06-06")
    assert filed.status_code == 201
    return_id = filed.json()["id"]
    paid = _pay(client, return_id, "4.00", "2026-06-06")
    assert paid.status_code == 201
    refunded = _refund(client, return_id, "1.00", "2026-06-06")
    assert refunded.status_code == 201
    statement = _year(client, DEV_KEY)
    assert statement.status_code == 200
    row = next(item for item in statement.json()["filings"] if item["return_id"] == return_id)
    assert [line["kind"] for line in row["lines"]] == ["payment", "refund"]

    _switch(client, OTHER_KEY, OTHER_TENANT)
    foreign = _year(client, OTHER_KEY)
    assert foreign.status_code == 200
    assert return_id not in {item["return_id"] for item in foreign.json()["filings"]}

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
                UUID(return_id),
            ) == []
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
                "SELECT id FROM allyanna.tot_returns WHERE id = $1",
                UUID(return_id),
            ) is None
            await repository.set_scope(demo, master_account_id=HARBOUR, tenant_id=UUID(GREAT_BAY))
            visible = await demo.fetchval(
                "SELECT tot_amount FROM allyanna.tot_returns WHERE id = $1",
                UUID(return_id),
            )
            assert Decimal(visible) == Decimal("10.00")
    finally:
        await demo.close()
