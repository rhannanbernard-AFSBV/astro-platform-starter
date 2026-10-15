"""Filing the year statement stores the tax, amount paid, and balance."""

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
            "vendor_name": "Summary Goods",
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


def _summarize(client: TestClient, key: str, tax_year: int) -> object:
    return client.post(
        "/api/v1/tax/tot/summaries",
        headers=_auth(key),
        json={"tax_year": tax_year, "country_code": "SXM"},
    )


def _money(value: object) -> Decimal:
    assert isinstance(value, str)
    return Decimal(value)


@pytest.mark.asyncio
async def test_the_annual_summary_freezes_the_year_statement(
    client: TestClient, database_url: str
) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    priced = client.post(
        "/api/v1/tax/tot",
        headers=_auth(DEV_KEY),
        json={"tax_year": 2026, "country_code": "SXM", "gross_taxable_revenue": "200.00"},
    )
    assert priced.status_code == 200
    table_tax = priced.json()["tot_amount"]
    assert table_tax == "10.00"

    empty = _summarize(client, DEV_KEY, 2025)
    assert empty.status_code == 422
    assert empty.json()["code"] == "invalid_worksheet"
    before = client.get("/api/v1/tax/tot/summaries", headers=_auth(DEV_KEY))
    assert before.status_code == 200
    assert before.json()["tenant_id"] == GREAT_BAY
    assert before.json()["summaries"] == []

    created = _invoice(client, "YSUM-JUNE", "2026-06-08")
    assert created.status_code == 201
    filed = _file(client, "2026-06-08", "2026-06-08")
    assert filed.status_code == 201
    assert filed.json()["tot_amount"] == table_tax
    assert filed.json()["due_on"] is None
    original_id = filed.json()["id"]
    paid = _pay(client, original_id, "4.00", "2026-06-08")
    assert paid.status_code == 201
    payment_id = paid.json()["id"]
    amended = client.post(
        f"/api/v1/tax/tot/returns/{original_id}/amendments",
        headers=_auth(DEV_KEY),
        json={},
    )
    assert amended.status_code == 201
    assert amended.json()["tot_amount"] == table_tax
    assert amended.json()["due_on"] is None
    latest_id = amended.json()["id"]
    refunded = _refund(client, latest_id, "1.00", "2026-06-08")
    assert refunded.status_code == 201
    refund_id = refunded.json()["id"]
    assert refunded.json()["amount"] == "1.00"
    assert refunded.json()["amount_paid"] == "3.00"
    assert refunded.json()["balance_due"] == "7.00"

    captured = _year(client, DEV_KEY)
    assert captured.status_code == 200
    live = captured.json()
    assert live["currency_code"] == "XCG"
    ids = [item["return_id"] for item in live["filings"]]
    assert original_id not in ids
    assert latest_id in ids

    recorded = _summarize(client, DEV_KEY, 2026)
    assert recorded.status_code == 201
    summary = recorded.json()
    summary_id = summary["id"]
    assert summary["tenant_id"] == GREAT_BAY
    assert summary["country_code"] == "SXM"
    assert summary["tax_year"] == 2026
    assert summary["currency_code"] == "XCG"
    assert summary["filing_count"] == len(live["filings"])
    assert _money(summary["tax_due"]) == _money(live["tax_due"])
    assert _money(summary["amount_paid"]) == _money(live["amount_paid"])
    assert _money(summary["balance_due"]) == _money(live["balance_due"])
    assert _money(summary["balance_due"]) == _money(summary["tax_due"]) - _money(summary["amount_paid"])

    fetched = client.get(f"/api/v1/tax/tot/summaries/{summary_id}", headers=_auth(DEV_KEY))
    assert fetched.status_code == 200
    assert fetched.json()["tax_due"] == summary["tax_due"]
    assert fetched.json()["amount_paid"] == summary["amount_paid"]
    assert fetched.json()["balance_due"] == summary["balance_due"]
    listing = client.get("/api/v1/tax/tot/summaries", headers=_auth(DEV_KEY))
    assert listing.status_code == 200
    assert [item["id"] for item in listing.json()["summaries"]] == [summary_id]

    original = client.get(f"/api/v1/tax/tot/returns/{original_id}", headers=_auth(DEV_KEY))
    assert original.status_code == 200
    assert original.json()["tot_amount"] == table_tax
    assert original.json()["superseded"] is True
    stored_payment = client.get(f"/api/v1/tax/tot/payments/{payment_id}", headers=_auth(DEV_KEY))
    stored_refund = client.get(f"/api/v1/tax/tot/refunds/{refund_id}", headers=_auth(DEV_KEY))
    assert stored_payment.status_code == 200
    assert stored_payment.json()["amount"] == "4.00"
    assert stored_refund.status_code == 200
    assert stored_refund.json()["amount"] == "1.00"

    later = _pay(client, latest_id, "1.00", "2026-06-09")
    assert later.status_code == 201
    moved = _year(client, DEV_KEY)
    assert moved.status_code == 200
    assert _money(moved.json()["amount_paid"]) == _money(summary["amount_paid"]) + Decimal("1.00")
    assert _money(moved.json()["balance_due"]) == _money(summary["balance_due"]) - Decimal("1.00")
    frozen = client.get(f"/api/v1/tax/tot/summaries/{summary_id}", headers=_auth(DEV_KEY))
    assert frozen.status_code == 200
    assert frozen.json()["tax_due"] == summary["tax_due"]
    assert frozen.json()["amount_paid"] == summary["amount_paid"]
    assert frozen.json()["balance_due"] == summary["balance_due"]
    assert frozen.json()["filing_count"] == summary["filing_count"]
    assert stored_payment.json()["amount"] == "4.00"
    again = client.get(f"/api/v1/tax/tot/payments/{payment_id}", headers=_auth(DEV_KEY))
    again_refund = client.get(f"/api/v1/tax/tot/refunds/{refund_id}", headers=_auth(DEV_KEY))
    assert again.status_code == 200
    assert again.json()["amount"] == "4.00"
    assert again_refund.status_code == 200
    assert again_refund.json()["amount"] == "1.00"

    duplicate = _summarize(client, DEV_KEY, 2026)
    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "tot_annual_summary_already_filed"

    _switch(client, DEV_KEY, SIMPSON_BAY)
    sibling = client.get(f"/api/v1/tax/tot/summaries/{summary_id}", headers=_auth(DEV_KEY))
    assert sibling.status_code == 404
    assert sibling.json()["code"] == "tot_annual_summary_not_found"
    sibling_list = client.get("/api/v1/tax/tot/summaries", headers=_auth(DEV_KEY))
    assert sibling_list.status_code == 200
    assert sibling_list.json()["tenant_id"] == SIMPSON_BAY
    assert sibling_list.json()["summaries"] == []

    _switch(client, OTHER_KEY, OTHER_TENANT)
    foreign = client.get(f"/api/v1/tax/tot/summaries/{summary_id}", headers=_auth(OTHER_KEY))
    assert foreign.status_code == 404
    assert foreign.json()["code"] == "tot_annual_summary_not_found"
    foreign_list = client.get("/api/v1/tax/tot/summaries", headers=_auth(OTHER_KEY))
    assert foreign_list.status_code == 200
    assert foreign_list.json()["tenant_id"] == OTHER_TENANT
    assert foreign_list.json()["summaries"] == []

    repository = TenancyRepository()
    other = await asyncpg.connect(database_url)
    try:
        async with other.transaction():
            user = await repository.resolve_user(other, OTHER_KEY)
            assert user is not None
            await repository.set_user(other, user.id)
            await repository.set_scope(other, master_account_id=OTHER_FIRM, tenant_id=UUID(GREAT_BAY))
            assert await other.fetch(
                "SELECT id FROM allyanna.tot_annual_summaries WHERE id = $1",
                UUID(summary_id),
            ) == []
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            async with other.transaction():
                user = await repository.resolve_user(other, OTHER_KEY)
                assert user is not None
                await repository.set_user(other, user.id)
                await repository.set_scope(other, master_account_id=OTHER_FIRM, tenant_id=UUID(GREAT_BAY))
                await other.execute(
                    """
                    INSERT INTO allyanna.tot_annual_summaries (
                      tenant_id, country_code, tax_year, currency_code, filing_count,
                      tax_due, amount_paid, balance_due
                    )
                    VALUES (
                      current_setting('allyanna.tenant_id', true)::uuid,
                      'SXM', 2026, 'XCG', 1, 10.00, 3.00, 7.00
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
                "SELECT id FROM allyanna.tot_annual_summaries WHERE id = $1",
                UUID(summary_id),
            ) is None
            await repository.set_scope(demo, master_account_id=HARBOUR, tenant_id=UUID(GREAT_BAY))
            visible = await demo.fetchval(
                "SELECT tax_due FROM allyanna.tot_annual_summaries WHERE id = $1",
                UUID(summary_id),
            )
            assert Decimal(visible) == _money(summary["tax_due"])
    finally:
        await demo.close()
