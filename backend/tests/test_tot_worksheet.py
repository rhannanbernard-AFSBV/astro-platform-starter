"""A period worksheet sums posted invoices for the active business only."""

from datetime import date
from decimal import Decimal
from uuid import UUID

import asyncpg
import pytest
from fastapi.testclient import TestClient

from allyanna.tenancy.repository import TenancyRepository
from allyanna.worksheets.sum import sum_money

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


def _invoice(number: str, invoice_date: str, *, unit_price: str, quantity: str = "1") -> dict[str, object]:
    return {
        "vendor_name": f"Worksheet {number}",
        "invoice_number": number,
        "invoice_date": invoice_date,
        "tax_year": 2026,
        "country_code": "SXM",
        "lines": [{"description": "Goods", "quantity": quantity, "unit_price": unit_price}],
    }


def _worksheet(client: TestClient, key: str, start: str, end: str) -> object:
    return client.post(
        "/api/v1/tax/tot/worksheet",
        headers=_auth(key),
        json={
            "period_start": start,
            "period_end": end,
            "tax_year": 2026,
            "country_code": "SXM",
        },
    )


def test_sum_money_adds_posted_amounts() -> None:
    assert sum_money([Decimal("215.00"), Decimal("200.00")]) == Decimal("415.00")
    assert sum_money(()) == Decimal("0.00")


def test_worksheet_requires_a_profile_and_a_period_inside_the_year(
    client: TestClient,
    admin_sql,
) -> None:
    admin_sql(f"DELETE FROM allyanna.user_active_contexts WHERE user_id = '{DEMO_USER}'")
    missing = _worksheet(client, DEV_KEY, "2026-06-01", "2026-06-30")
    assert missing.status_code == 409
    assert missing.json()["code"] == "tenant_context_required"
    _switch(client, DEV_KEY, GREAT_BAY)
    backwards = _worksheet(client, DEV_KEY, "2026-06-30", "2026-06-01")
    assert backwards.status_code == 422
    assert backwards.json()["code"] == "invalid_worksheet"
    other_year = client.post(
        "/api/v1/tax/tot/worksheet",
        headers=_auth(DEV_KEY),
        json={
            "period_start": "2025-06-01",
            "period_end": "2025-06-30",
            "tax_year": 2026,
            "country_code": "SXM",
        },
    )
    assert other_year.status_code == 422
    assert other_year.json()["code"] == "invalid_worksheet"


def test_worksheet_sums_posted_subtotals_and_turnover_tax(client: TestClient) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    first = client.post(
        "/api/v1/invoices",
        headers=_auth(DEV_KEY),
        json=_invoice("WS-215", "2026-06-01", quantity="2", unit_price="100.00"),
    )
    second = client.post(
        "/api/v1/invoices",
        headers=_auth(DEV_KEY),
        json=_invoice("WS-200", "2026-06-30", unit_price="200.00"),
    )
    outside = client.post(
        "/api/v1/invoices",
        headers=_auth(DEV_KEY),
        json=_invoice("WS-JULY", "2026-07-01", unit_price="50.00"),
    )
    assert first.status_code == 201
    assert second.status_code == 201
    assert outside.status_code == 201
    produce = client.post(
        "/api/v1/invoices",
        headers=_auth(DEV_KEY),
        json={
            "vendor_name": "Worksheet WS-OIL",
            "invoice_number": "WS-OIL",
            "invoice_date": "2026-06-15",
            "tax_year": 2026,
            "country_code": "SXM",
            "lines": [{"description": "Oil", "quantity": "1.5", "unit_price": "10.00"}],
        },
    )
    assert produce.status_code == 201

    sheet = _worksheet(client, DEV_KEY, "2026-06-01", "2026-06-30")
    assert sheet.status_code == 200
    body = sheet.json()
    assert body["tenant_id"] == GREAT_BAY
    assert body["invoice_count"] == 3
    assert body["subtotal"] == "415.00"
    assert body["tot_amount"] == "20.75"
    assert body["grand_total"] == "435.75"
    assert body["rate"] == "0.05"
    assert body["currency_code"] == "XCG"
    assert body["tax_year"] == 2026
    assert isinstance(body["tot_amount"], str)
    assert [row["invoice_date"] for row in body["invoices"]] == [
        "2026-06-01",
        "2026-06-15",
        "2026-06-30",
    ]
    assert "WS-JULY" not in {row["vendor_name"] for row in body["invoices"]}

    empty = _worksheet(client, DEV_KEY, "2026-02-01", "2026-02-28")
    assert empty.status_code == 200
    assert empty.json()["invoice_count"] == 0
    assert empty.json()["subtotal"] == "0.00"
    assert empty.json()["tot_amount"] == "0.00"
    assert empty.json()["rate"] == "0.05"


def test_worksheet_rate_comes_from_the_tax_table(client: TestClient, admin_sql) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    created = client.post(
        "/api/v1/invoices",
        headers=_auth(DEV_KEY),
        json=_invoice("WS-RATE", "2026-08-10", unit_price="200.00"),
    )
    assert created.status_code == 201
    assert created.json()["tot_amount"] == "10.00"
    admin_sql(
        "UPDATE allyanna.tot_rates SET rate = 0.07000000 "
        f"WHERE tax_schedule_id = '{TOT_SCHEDULE}'"
    )
    try:
        sheet = _worksheet(client, DEV_KEY, "2026-08-01", "2026-08-31")
        assert sheet.status_code == 200
        body = sheet.json()
        assert body["rate"] == "0.07"
        assert body["subtotal"] == "200.00"
        assert body["tot_amount"] == "10.00"
        assert body["invoices"][0]["tot_rate"] == "0.05"
        assert body["invoices"][0]["tot_amount"] == "10.00"
    finally:
        admin_sql(
            "UPDATE allyanna.tot_rates SET rate = 0.05000000 "
            f"WHERE tax_schedule_id = '{TOT_SCHEDULE}'"
        )


@pytest.mark.asyncio
async def test_another_firm_cannot_read_the_worksheet(client: TestClient, database_url: str) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    created = client.post(
        "/api/v1/invoices",
        headers=_auth(DEV_KEY),
        json=_invoice("WS-FIRM", "2026-09-12", quantity="2", unit_price="100.00"),
    )
    assert created.status_code == 201
    vendor = created.json()["vendor_name"]

    own = _worksheet(client, DEV_KEY, "2026-09-01", "2026-09-30")
    assert own.status_code == 200
    assert own.json()["subtotal"] == "200.00"
    assert own.json()["tot_amount"] == "10.00"
    assert vendor in {row["vendor_name"] for row in own.json()["invoices"]}

    _switch(client, DEV_KEY, SIMPSON_BAY)
    sibling = _worksheet(client, DEV_KEY, "2026-09-01", "2026-09-30")
    assert sibling.status_code == 200
    assert sibling.json()["tenant_id"] == SIMPSON_BAY
    assert sibling.json()["invoice_count"] == 0
    assert sibling.json()["subtotal"] == "0.00"
    assert sibling.json()["tot_amount"] == "0.00"
    assert vendor not in {row["vendor_name"] for row in sibling.json()["invoices"]}

    _switch(client, OTHER_KEY, OTHER_TENANT)
    foreign = _worksheet(client, OTHER_KEY, "2026-09-01", "2026-09-30")
    assert foreign.status_code == 200
    assert foreign.json()["tenant_id"] == OTHER_TENANT
    assert foreign.json()["invoices"] == []
    assert foreign.json()["tot_amount"] == "0.00"

    await _assert_period_rls(database_url)


async def _assert_period_rls(database_url: str) -> None:
    repository = TenancyRepository()
    other = await asyncpg.connect(database_url)
    try:
        async with other.transaction():
            user = await repository.resolve_user(other, OTHER_KEY)
            assert user is not None
            await repository.set_user(other, user.id)
            await repository.set_scope(other, master_account_id=OTHER_FIRM, tenant_id=UUID(GREAT_BAY))
            leaked = await other.fetchval(
                """
                SELECT coalesce(sum(subtotal), 0)
                FROM allyanna.invoices
                WHERE invoice_date >= $1 AND invoice_date <= $2
                """,
                date(2026, 9, 1),
                date(2026, 9, 30),
            )
            assert Decimal(leaked) == Decimal("0")
    finally:
        await other.close()

    demo = await asyncpg.connect(database_url)
    try:
        async with demo.transaction():
            user = await repository.resolve_user(demo, DEV_KEY)
            assert user is not None
            await repository.set_user(demo, user.id)
            await repository.set_scope(demo, master_account_id=HARBOUR, tenant_id=UUID(SIMPSON_BAY))
            hidden = await demo.fetchval(
                """
                SELECT coalesce(sum(tot_amount), 0)
                FROM allyanna.invoices
                WHERE invoice_date >= $1 AND invoice_date <= $2
                """,
                date(2026, 9, 1),
                date(2026, 9, 30),
            )
            assert Decimal(hidden) == Decimal("0")
            await repository.set_scope(demo, master_account_id=HARBOUR, tenant_id=UUID(GREAT_BAY))
            visible = await demo.fetchval(
                """
                SELECT sum(subtotal)
                FROM allyanna.invoices
                WHERE invoice_date >= $1 AND invoice_date <= $2
                """,
                date(2026, 9, 1),
                date(2026, 9, 30),
            )
            assert Decimal(visible) == Decimal("200.00")
    finally:
        await demo.close()
