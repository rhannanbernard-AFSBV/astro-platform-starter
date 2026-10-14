"""The summary statement lists each version and the change from the one before it."""

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


def _money(value: object) -> Decimal:
    assert isinstance(value, str)
    return Decimal(value)


def _assert_chain(body: dict[str, object], ordered: list[dict[str, object]]) -> None:
    versions = body["versions"]
    assert isinstance(versions, list)
    assert [item["summary_id"] for item in versions] == [item["id"] for item in ordered]
    assert body["tenant_id"] == GREAT_BAY
    assert body["tax_year"] == 2026
    assert body["country_code"] == "SXM"
    assert body["currency_code"] == "XCG"
    previous_tax = Decimal("0")
    previous_paid = Decimal("0")
    previous_balance = Decimal("0")
    tax_change = Decimal("0")
    paid_change = Decimal("0")
    balance_change = Decimal("0")
    for version, stored in zip(versions, ordered, strict=True):
        assert version["tax_due"] == stored["tax_due"]
        assert version["amount_paid"] == stored["amount_paid"]
        assert version["balance_due"] == stored["balance_due"]
        assert version["filing_count"] == stored["filing_count"]
        assert version["amends_summary_id"] == stored["amends_summary_id"]
        assert version["superseded"] == stored["superseded"]
        assert _money(version["balance_due"]) == _money(version["tax_due"]) - _money(version["amount_paid"])
        assert _money(version["tax_change"]) == _money(version["tax_due"]) - previous_tax
        assert _money(version["amount_paid_change"]) == _money(version["amount_paid"]) - previous_paid
        assert _money(version["balance_change"]) == _money(version["balance_due"]) - previous_balance
        assert _money(version["balance_change"]) == (
            _money(version["tax_change"]) - _money(version["amount_paid_change"])
        )
        previous_tax = _money(version["tax_due"])
        previous_paid = _money(version["amount_paid"])
        previous_balance = _money(version["balance_due"])
        tax_change += _money(version["tax_change"])
        paid_change += _money(version["amount_paid_change"])
        balance_change += _money(version["balance_change"])
    latest = versions[-1]
    assert _money(body["tax_due"]) == previous_tax == _money(latest["tax_due"]) == tax_change
    assert _money(body["amount_paid"]) == previous_paid == _money(latest["amount_paid"]) == paid_change
    assert _money(body["balance_due"]) == previous_balance == _money(latest["balance_due"]) == balance_change


@pytest.mark.asyncio
async def test_the_summary_statement_lists_each_version_and_its_change(
    client: TestClient, database_url: str
) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    listing = client.get("/api/v1/tax/tot/summaries", headers=_auth(DEV_KEY))
    assert listing.status_code == 200
    rows = [item for item in listing.json()["summaries"] if item["tax_year"] == 2026]
    originals = [item for item in rows if item["amends_summary_id"] is None]
    assert len(originals) == 1
    by_parent = {item["amends_summary_id"]: item for item in rows if item["amends_summary_id"] is not None}
    ordered = [originals[0]]
    while ordered[-1]["id"] in by_parent:
        ordered.append(by_parent[ordered[-1]["id"]])
    assert len(ordered) == 3
    assert ordered[0]["superseded"] is True
    assert ordered[1]["amends_summary_id"] == ordered[0]["id"]
    assert ordered[1]["superseded"] is True
    assert ordered[2]["amends_summary_id"] == ordered[1]["id"]
    assert ordered[2]["superseded"] is False
    assert _money(ordered[2]["amount_paid"]) > _money(ordered[0]["amount_paid"])

    missing = _statement(client, DEV_KEY, MISSING)
    assert missing.status_code == 404
    assert missing.json()["code"] == "tot_annual_summary_not_found"

    year_before = client.get(
        "/api/v1/tax/tot/statements",
        headers=_auth(DEV_KEY),
        params={"tax_year": 2026, "country_code": "SXM"},
    )
    assert year_before.status_code == 200
    first = _statement(client, DEV_KEY, ordered[0]["id"])
    assert first.status_code == 200
    body = first.json()
    _assert_chain(body, ordered)
    assert _money(body["versions"][0]["tax_change"]) == _money(ordered[0]["tax_due"])
    assert _money(body["versions"][0]["amount_paid_change"]) == _money(ordered[0]["amount_paid"])
    assert _money(body["versions"][0]["balance_change"]) == _money(ordered[0]["balance_due"])
    assert _money(body["versions"][1]["amount_paid_change"]) > Decimal("0")
    assert _money(body["versions"][2]["amount_paid_change"]) == Decimal("1.00")
    unfiled = body["unfiled"]
    assert _money(unfiled["tax_due"]) == _money(year_before.json()["tax_due"])
    assert _money(unfiled["amount_paid"]) == _money(year_before.json()["amount_paid"])
    assert _money(unfiled["balance_due"]) == _money(year_before.json()["balance_due"])
    assert unfiled["filing_count"] == len(year_before.json()["filings"])
    assert _money(unfiled["tax_change"]) == Decimal("0.00")
    assert _money(unfiled["amount_paid_change"]) == Decimal("0.00")
    assert _money(unfiled["balance_change"]) == Decimal("0.00")
    for summary_id in (ordered[1]["id"], ordered[2]["id"]):
        again = _statement(client, DEV_KEY, summary_id)
        assert again.status_code == 200
        assert [item["summary_id"] for item in again.json()["versions"]] == [
            item["summary_id"] for item in body["versions"]
        ]
        assert again.json()["tax_due"] == body["tax_due"]
        assert again.json()["amount_paid"] == body["amount_paid"]
        assert again.json()["balance_due"] == body["balance_due"]
        assert again.json()["unfiled"] == body["unfiled"]

    for stored in ordered:
        readable = client.get(f"/api/v1/tax/tot/summaries/{stored['id']}", headers=_auth(DEV_KEY))
        assert readable.status_code == 200
        assert readable.json()["tax_due"] == stored["tax_due"]
        assert readable.json()["amount_paid"] == stored["amount_paid"]
        assert readable.json()["balance_due"] == stored["balance_due"]

    payable = next(
        item for item in year_before.json()["filings"] if _money(item["balance_due"]) >= Decimal("1.00")
    )
    paid = client.post(
        f"/api/v1/tax/tot/returns/{payable['return_id']}/payments",
        headers=_auth(DEV_KEY),
        json={"amount": "1.00", "paid_on": "2026-06-12"},
    )
    assert paid.status_code == 201
    year_after = client.get(
        "/api/v1/tax/tot/statements",
        headers=_auth(DEV_KEY),
        params={"tax_year": 2026, "country_code": "SXM"},
    )
    assert year_after.status_code == 200
    assert _money(year_after.json()["amount_paid"]) == _money(year_before.json()["amount_paid"]) + Decimal("1.00")
    assert _money(year_after.json()["balance_due"]) == _money(year_before.json()["balance_due"]) - Decimal("1.00")
    held = _statement(client, DEV_KEY, ordered[0]["id"])
    assert held.status_code == 200
    assert held.json()["tax_due"] == body["tax_due"]
    assert held.json()["amount_paid"] == body["amount_paid"]
    assert held.json()["balance_due"] == body["balance_due"]
    assert [
        (item["tax_due"], item["amount_paid"], item["balance_due"], item["tax_change"], item["amount_paid_change"], item["balance_change"])
        for item in held.json()["versions"]
    ] == [
        (item["tax_due"], item["amount_paid"], item["balance_due"], item["tax_change"], item["amount_paid_change"], item["balance_change"])
        for item in body["versions"]
    ]
    gap = held.json()["unfiled"]
    assert _money(gap["tax_due"]) == _money(year_after.json()["tax_due"])
    assert _money(gap["amount_paid"]) == _money(year_after.json()["amount_paid"])
    assert _money(gap["balance_due"]) == _money(year_after.json()["balance_due"])
    assert gap["filing_count"] == len(year_after.json()["filings"])
    assert _money(gap["tax_change"]) == Decimal("0.00")
    assert _money(gap["amount_paid_change"]) == Decimal("1.00")
    assert _money(gap["balance_change"]) == Decimal("-1.00")
    assert _money(gap["balance_change"]) == _money(gap["tax_change"]) - _money(gap["amount_paid_change"])
    original = client.get(f"/api/v1/tax/tot/summaries/{ordered[0]['id']}", headers=_auth(DEV_KEY))
    assert original.status_code == 200
    assert original.json()["tax_due"] == ordered[0]["tax_due"]
    assert original.json()["amount_paid"] == ordered[0]["amount_paid"]
    assert original.json()["balance_due"] == ordered[0]["balance_due"]
    assert original.json()["superseded"] is True

    _switch(client, DEV_KEY, SIMPSON_BAY)
    for stored in ordered:
        sibling = _statement(client, DEV_KEY, stored["id"])
        assert sibling.status_code == 404
        assert sibling.json()["code"] == "tot_annual_summary_not_found"
    sibling_list = client.get("/api/v1/tax/tot/summaries", headers=_auth(DEV_KEY))
    assert sibling_list.status_code == 200
    assert sibling_list.json()["summaries"] == []

    _switch(client, OTHER_KEY, OTHER_TENANT)
    for stored in ordered:
        foreign = _statement(client, OTHER_KEY, stored["id"])
        assert foreign.status_code == 404
        assert foreign.json()["code"] == "tot_annual_summary_not_found"
    foreign_list = client.get("/api/v1/tax/tot/summaries", headers=_auth(OTHER_KEY))
    assert foreign_list.status_code == 200
    assert foreign_list.json()["summaries"] == []

    repository = TenancyRepository()
    other = await asyncpg.connect(database_url)
    try:
        async with other.transaction():
            user = await repository.resolve_user(other, OTHER_KEY)
            assert user is not None
            await repository.set_user(other, user.id)
            await repository.set_scope(other, master_account_id=OTHER_FIRM, tenant_id=UUID(GREAT_BAY))
            for stored in ordered:
                assert await other.fetch(
                    "SELECT id FROM allyanna.tot_annual_summaries WHERE id = $1",
                    UUID(stored["id"]),
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
            for stored in ordered:
                assert await demo.fetchval(
                    "SELECT id FROM allyanna.tot_annual_summaries WHERE id = $1",
                    UUID(stored["id"]),
                ) is None
            await repository.set_scope(demo, master_account_id=HARBOUR, tenant_id=UUID(GREAT_BAY))
            visible = await demo.fetchval(
                "SELECT amount_paid FROM allyanna.tot_annual_summaries WHERE id = $1",
                UUID(ordered[0]["id"]),
            )
            assert Decimal(visible) == _money(ordered[0]["amount_paid"])
    finally:
        await demo.close()
