"""Filing the unfiled gap stores the live year totals as the next summary."""

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


def _statement(client: TestClient, key: str, summary_id: str) -> object:
    return client.get(
        f"/api/v1/tax/tot/summaries/{summary_id}/statement",
        headers=_auth(key),
    )


def _file_unfiled(client: TestClient, key: str, summary_id: str) -> object:
    return client.post(
        f"/api/v1/tax/tot/summaries/{summary_id}/unfiled",
        headers=_auth(key),
        json={},
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
async def test_filing_the_unfiled_gap_stores_the_live_year_totals(
    client: TestClient, database_url: str
) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    ordered = _chain(client)
    assert len(ordered) >= 3
    original_id = ordered[0]["id"]
    latest_before = ordered[-1]
    assert latest_before["superseded"] is False

    before = _statement(client, DEV_KEY, original_id)
    assert before.status_code == 200
    gap = before.json()["unfiled"]
    assert _money(gap["amount_paid_change"]) == Decimal("1.00")
    assert _money(gap["balance_change"]) == Decimal("-1.00")
    assert _money(gap["tax_change"]) == Decimal("0.00")
    live_tax = gap["tax_due"]
    live_paid = gap["amount_paid"]
    live_balance = gap["balance_due"]
    live_count = gap["filing_count"]

    rejected = client.post(
        f"/api/v1/tax/tot/summaries/{original_id}/unfiled",
        headers=_auth(DEV_KEY),
        json={"amount_paid": "1.00"},
    )
    assert rejected.status_code == 422

    missing = _file_unfiled(client, DEV_KEY, MISSING)
    assert missing.status_code == 404
    assert missing.json()["code"] == "tot_annual_summary_not_found"

    filed = _file_unfiled(client, DEV_KEY, original_id)
    assert filed.status_code == 201
    body = filed.json()
    filed_id = body["id"]
    assert filed_id != latest_before["id"]
    assert body["amends_summary_id"] == latest_before["id"]
    assert body["superseded"] is False
    assert body["tenant_id"] == GREAT_BAY
    assert body["tax_year"] == 2026
    assert body["currency_code"] == "XCG"
    assert body["tax_due"] == live_tax
    assert body["amount_paid"] == live_paid
    assert body["balance_due"] == live_balance
    assert body["filing_count"] == live_count
    assert _money(body["balance_due"]) == _money(body["tax_due"]) - _money(body["amount_paid"])

    stored_latest = client.get(f"/api/v1/tax/tot/summaries/{latest_before['id']}", headers=_auth(DEV_KEY))
    assert stored_latest.status_code == 200
    assert stored_latest.json()["superseded"] is True
    assert stored_latest.json()["tax_due"] == latest_before["tax_due"]
    assert stored_latest.json()["amount_paid"] == latest_before["amount_paid"]
    assert stored_latest.json()["balance_due"] == latest_before["balance_due"]
    original = client.get(f"/api/v1/tax/tot/summaries/{original_id}", headers=_auth(DEV_KEY))
    assert original.status_code == 200
    assert original.json()["superseded"] is True
    assert original.json()["tax_due"] == ordered[0]["tax_due"]
    assert original.json()["amount_paid"] == ordered[0]["amount_paid"]

    after = _statement(client, DEV_KEY, original_id)
    assert after.status_code == 200
    versions = after.json()["versions"]
    assert versions[-1]["summary_id"] == filed_id
    assert versions[-1]["amends_summary_id"] == latest_before["id"]
    assert _money(versions[-1]["amount_paid_change"]) == Decimal("1.00")
    assert _money(versions[-1]["balance_change"]) == Decimal("-1.00")
    assert after.json()["tax_due"] == live_tax
    assert after.json()["amount_paid"] == live_paid
    assert after.json()["balance_due"] == live_balance
    unfiled = after.json()["unfiled"]
    assert _money(unfiled["tax_change"]) == Decimal("0.00")
    assert _money(unfiled["amount_paid_change"]) == Decimal("0.00")
    assert _money(unfiled["balance_change"]) == Decimal("0.00")
    assert unfiled["filing_count"] == live_count
    assert unfiled["tax_due"] == live_tax
    assert unfiled["amount_paid"] == live_paid
    assert unfiled["balance_due"] == live_balance

    again = _file_unfiled(client, DEV_KEY, filed_id)
    assert again.status_code == 422
    assert again.json()["code"] == "invalid_worksheet"
    from_latest = _file_unfiled(client, DEV_KEY, latest_before["id"])
    assert from_latest.status_code == 422
    assert from_latest.json()["code"] == "invalid_worksheet"

    _switch(client, DEV_KEY, SIMPSON_BAY)
    sibling = _file_unfiled(client, DEV_KEY, filed_id)
    sibling_read = _statement(client, DEV_KEY, filed_id)
    assert sibling.status_code == 404
    assert sibling.json()["code"] == "tot_annual_summary_not_found"
    assert sibling_read.status_code == 404

    _switch(client, OTHER_KEY, OTHER_TENANT)
    foreign = _file_unfiled(client, OTHER_KEY, filed_id)
    foreign_read = _statement(client, OTHER_KEY, original_id)
    assert foreign.status_code == 404
    assert foreign.json()["code"] == "tot_annual_summary_not_found"
    assert foreign_read.status_code == 404

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
                UUID(filed_id),
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
                      tax_due, amount_paid, balance_due, amends_summary_id
                    )
                    VALUES (
                      current_setting('allyanna.tenant_id', true)::uuid,
                      'SXM', 2026, 'XCG', 1, 10.00, 4.00, 6.00, $1
                    )
                    """,
                    UUID(filed_id),
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
                UUID(filed_id),
            ) is None
            await repository.set_scope(demo, master_account_id=HARBOUR, tenant_id=UUID(GREAT_BAY))
            visible = await demo.fetchval(
                "SELECT amount_paid FROM allyanna.tot_annual_summaries WHERE id = $1",
                UUID(filed_id),
            )
            assert Decimal(visible) == _money(live_paid)
    finally:
        await demo.close()
