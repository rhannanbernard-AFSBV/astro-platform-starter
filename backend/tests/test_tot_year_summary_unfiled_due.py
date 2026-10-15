"""A pay-due reminder shows the balance owed and any unfiled live gap."""

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
MISSING = "00000000-0000-4000-8000-000000000099"


def _auth(key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {key}"}


def _switch(client: TestClient, key: str, tenant_id: str) -> None:
    switched = client.post(
        "/api/v1/context/switch",
        headers=_auth(key),
        json={"tenant_id": tenant_id},
    )
    assert switched.status_code == 200


def _due(client: TestClient, key: str, summary_id: str) -> object:
    return client.get(
        f"/api/v1/tax/tot/summaries/{summary_id}/due",
        headers=_auth(key),
    )


def _money(value: object) -> Decimal:
    assert isinstance(value, str)
    return Decimal(value)


def _chain(client: TestClient) -> list[dict[str, object]]:
    listing = client.get("/api/v1/tax/tot/summaries", headers=_auth(DEV_KEY))
    assert listing.status_code == 200
    rows = [item for item in listing.json()["summaries"] if item["tax_year"] == 2026]
    originals = [item for item in rows if item["amends_summary_id"] is None]
    assert len(originals) == 1
    by_parent = {item["amends_summary_id"]: item for item in rows if item["amends_summary_id"] is not None}
    ordered = [originals[0]]
    while ordered[-1]["id"] in by_parent:
        ordered.append(by_parent[ordered[-1]["id"]])
    return ordered


@pytest.mark.asyncio
async def test_the_pay_due_reminder_calls_out_an_unfiled_gap(
    client: TestClient, database_url: str
) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    ordered = _chain(client)
    assert len(ordered) >= 4
    original_id = ordered[0]["id"]
    latest = ordered[-1]
    assert latest["superseded"] is False

    missing = _due(client, DEV_KEY, MISSING)
    assert missing.status_code == 404
    assert missing.json()["code"] == "tot_annual_summary_not_found"

    settled = _due(client, DEV_KEY, original_id)
    assert settled.status_code == 200
    body = settled.json()
    assert body["tenant_id"] == GREAT_BAY
    assert body["tax_year"] == 2026
    assert body["country_code"] == "SXM"
    assert body["currency_code"] == "XCG"
    assert body["summary_id"] == latest["id"]
    assert body["filed_tax_due"] == latest["tax_due"]
    assert body["filed_amount_paid"] == latest["amount_paid"]
    assert body["filed_balance_due"] == latest["balance_due"]
    assert body["amount_due"] == latest["balance_due"]
    assert body["has_unfiled_gap"] is False
    assert body["actions"]["can_file_unfiled"] is False
    assert body["actions"]["file_unfiled_path"] is None
    assert body["actions"]["year_statement_path"] == (
        "/api/v1/tax/tot/statements?tax_year=2026&country_code=SXM"
    )
    assert _money(body["unfiled"]["tax_change"]) == Decimal("0.00")
    assert _money(body["unfiled"]["amount_paid_change"]) == Decimal("0.00")
    assert _money(body["unfiled"]["balance_change"]) == Decimal("0.00")
    assert _money(body["amount_due"]) == _money(body["filed_balance_due"]) + _money(
        body["unfiled"]["balance_change"]
    )
    from_latest = _due(client, DEV_KEY, latest["id"])
    assert from_latest.status_code == 200
    assert from_latest.json()["summary_id"] == latest["id"]
    assert from_latest.json()["amount_due"] == body["amount_due"]
    assert from_latest.json()["has_unfiled_gap"] is False
    assert from_latest.json()["actions"] == body["actions"]

    year = client.get(
        "/api/v1/tax/tot/statements",
        headers=_auth(DEV_KEY),
        params={"tax_year": 2026, "country_code": "SXM"},
    )
    assert year.status_code == 200
    payable = next(
        item for item in year.json()["filings"] if _money(item["balance_due"]) >= Decimal("1.00")
    )
    paid = client.post(
        f"/api/v1/tax/tot/returns/{payable['return_id']}/payments",
        headers=_auth(DEV_KEY),
        json={"amount": "1.00", "paid_on": "2026-06-13"},
    )
    assert paid.status_code == 201
    live = client.get(
        "/api/v1/tax/tot/statements",
        headers=_auth(DEV_KEY),
        params={"tax_year": 2026, "country_code": "SXM"},
    )
    assert live.status_code == 200
    assert _money(live.json()["amount_paid"]) == _money(year.json()["amount_paid"]) + Decimal("1.00")
    assert _money(live.json()["balance_due"]) == _money(year.json()["balance_due"]) - Decimal("1.00")

    open_due = _due(client, DEV_KEY, original_id)
    assert open_due.status_code == 200
    reminder = open_due.json()
    assert reminder["summary_id"] == latest["id"]
    assert reminder["filed_tax_due"] == latest["tax_due"]
    assert reminder["filed_amount_paid"] == latest["amount_paid"]
    assert reminder["filed_balance_due"] == latest["balance_due"]
    assert reminder["has_unfiled_gap"] is True
    assert reminder["actions"]["can_file_unfiled"] is True
    assert reminder["actions"]["file_unfiled_path"] == (
        f"/api/v1/tax/tot/summaries/{latest['id']}/unfiled"
    )
    assert reminder["actions"]["year_statement_path"] == (
        "/api/v1/tax/tot/statements?tax_year=2026&country_code=SXM"
    )
    open_ids = {item["return_id"] for item in reminder["actions"]["open_returns"]}
    assert payable["return_id"] in open_ids
    paid_open = next(
        item
        for item in reminder["actions"]["open_returns"]
        if item["return_id"] == payable["return_id"]
    )
    assert paid_open["payment_path"] == (
        f"/api/v1/tax/tot/returns/{payable['return_id']}/payments"
    )
    assert _money(paid_open["balance_due"]) > Decimal("0")
    assert _money(reminder["amount_due"]) == _money(live.json()["balance_due"])
    assert _money(reminder["unfiled"]["tax_due"]) == _money(live.json()["tax_due"])
    assert _money(reminder["unfiled"]["amount_paid"]) == _money(live.json()["amount_paid"])
    assert _money(reminder["unfiled"]["balance_due"]) == _money(live.json()["balance_due"])
    assert _money(reminder["unfiled"]["tax_change"]) == Decimal("0.00")
    assert _money(reminder["unfiled"]["amount_paid_change"]) == Decimal("1.00")
    assert _money(reminder["unfiled"]["balance_change"]) == Decimal("-1.00")
    assert _money(reminder["amount_due"]) == _money(reminder["filed_balance_due"]) + _money(
        reminder["unfiled"]["balance_change"]
    )
    stored = client.get(f"/api/v1/tax/tot/summaries/{latest['id']}", headers=_auth(DEV_KEY))
    assert stored.status_code == 200
    assert stored.json()["balance_due"] == latest["balance_due"]
    assert stored.json()["superseded"] is False

    _switch(client, DEV_KEY, SIMPSON_BAY)
    sibling = _due(client, DEV_KEY, latest["id"])
    assert sibling.status_code == 404
    assert sibling.json()["code"] == "tot_annual_summary_not_found"

    _switch(client, OTHER_KEY, OTHER_TENANT)
    foreign = _due(client, OTHER_KEY, original_id)
    assert foreign.status_code == 404
    assert foreign.json()["code"] == "tot_annual_summary_not_found"

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
                UUID(latest["id"]),
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
                "SELECT id FROM allyanna.tot_annual_summaries WHERE id = $1",
                UUID(latest["id"]),
            ) is None
            await repository.set_scope(demo, master_account_id=HARBOUR, tenant_id=UUID(GREAT_BAY))
            visible = await demo.fetchval(
                "SELECT balance_due FROM allyanna.tot_annual_summaries WHERE id = $1",
                UUID(latest["id"]),
            )
            assert Decimal(visible) == _money(latest["balance_due"])
    finally:
        await demo.close()
