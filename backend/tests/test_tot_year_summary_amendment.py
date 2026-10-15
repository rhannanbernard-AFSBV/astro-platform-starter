"""An amendment stores the year totals after later payments. The earlier summary stays."""

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


def _year(client: TestClient) -> object:
    return client.get(
        "/api/v1/tax/tot/statements",
        headers=_auth(DEV_KEY),
        params={"tax_year": 2026, "country_code": "SXM"},
    )


def _pay(client: TestClient, return_id: str, paid_on: str) -> object:
    return client.post(
        f"/api/v1/tax/tot/returns/{return_id}/payments",
        headers=_auth(DEV_KEY),
        json={"amount": "1.00", "paid_on": paid_on},
    )


def _amend(client: TestClient, key: str, summary_id: str) -> object:
    return client.post(
        f"/api/v1/tax/tot/summaries/{summary_id}/amendments",
        headers=_auth(key),
        json={},
    )


def _money(value: object) -> Decimal:
    assert isinstance(value, str)
    return Decimal(value)


def _matches(summary: dict[str, object], statement: dict[str, object]) -> None:
    filings = statement["filings"]
    assert isinstance(filings, list)
    assert summary["filing_count"] == len(filings)
    assert _money(summary["tax_due"]) == _money(statement["tax_due"])
    assert _money(summary["amount_paid"]) == _money(statement["amount_paid"])
    assert _money(summary["balance_due"]) == _money(statement["balance_due"])
    assert _money(summary["balance_due"]) == _money(summary["tax_due"]) - _money(summary["amount_paid"])


def _unchanged(stored: dict[str, object], earlier: dict[str, object]) -> None:
    assert stored["tax_due"] == earlier["tax_due"]
    assert stored["amount_paid"] == earlier["amount_paid"]
    assert stored["balance_due"] == earlier["balance_due"]
    assert stored["filing_count"] == earlier["filing_count"]


@pytest.mark.asyncio
async def test_an_amendment_supersedes_the_frozen_year_totals(
    client: TestClient, database_url: str
) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    listing = client.get("/api/v1/tax/tot/summaries", headers=_auth(DEV_KEY))
    assert listing.status_code == 200
    originals = [
        item
        for item in listing.json()["summaries"]
        if item["tax_year"] == 2026 and item["amends_summary_id"] is None
    ]
    assert len(originals) == 1
    frozen = originals[0]
    assert frozen["tenant_id"] == GREAT_BAY
    assert frozen["superseded"] is False
    summary_id = frozen["id"]

    rejected = client.post(
        f"/api/v1/tax/tot/summaries/{summary_id}/amendments",
        headers=_auth(DEV_KEY),
        json={"tax_due": "1.00"},
    )
    assert rejected.status_code == 422

    before = _year(client)
    assert before.status_code == 200
    payable = next(
        item for item in before.json()["filings"] if _money(item["balance_due"]) >= Decimal("2.00")
    )
    return_id = payable["return_id"]
    paid = _pay(client, return_id, "2026-06-10")
    assert paid.status_code == 201
    live = _year(client)
    assert live.status_code == 200
    assert _money(live.json()["tax_due"]) == _money(before.json()["tax_due"])
    assert _money(live.json()["amount_paid"]) == _money(before.json()["amount_paid"]) + Decimal("1.00")
    assert _money(live.json()["balance_due"]) == _money(before.json()["balance_due"]) - Decimal("1.00")
    untouched = client.get(f"/api/v1/tax/tot/summaries/{summary_id}", headers=_auth(DEV_KEY))
    assert untouched.status_code == 200
    _unchanged(untouched.json(), frozen)
    assert untouched.json()["superseded"] is False

    amended = _amend(client, DEV_KEY, summary_id)
    assert amended.status_code == 201
    first = amended.json()
    first_id = first["id"]
    assert first_id != summary_id
    assert first["amends_summary_id"] == summary_id
    assert first["superseded"] is False
    assert first["tenant_id"] == GREAT_BAY
    assert first["tax_year"] == 2026
    assert first["country_code"] == "SXM"
    assert first["currency_code"] == "XCG"
    _matches(first, live.json())
    assert _money(first["amount_paid"]) > _money(frozen["amount_paid"])

    stored = client.get(f"/api/v1/tax/tot/summaries/{summary_id}", headers=_auth(DEV_KEY))
    assert stored.status_code == 200
    _unchanged(stored.json(), frozen)
    assert stored.json()["superseded"] is True
    assert stored.json()["amends_summary_id"] is None

    paid_again = _pay(client, return_id, "2026-06-11")
    assert paid_again.status_code == 201
    latest_year = _year(client)
    assert latest_year.status_code == 200
    assert _money(latest_year.json()["amount_paid"]) == _money(live.json()["amount_paid"]) + Decimal("1.00")
    assert _money(latest_year.json()["balance_due"]) == _money(live.json()["balance_due"]) - Decimal("1.00")
    held = client.get(f"/api/v1/tax/tot/summaries/{first_id}", headers=_auth(DEV_KEY))
    assert held.status_code == 200
    _unchanged(held.json(), first)
    assert held.json()["superseded"] is False

    amended_again = _amend(client, DEV_KEY, first_id)
    assert amended_again.status_code == 201
    latest = amended_again.json()
    latest_id = latest["id"]
    assert latest["amends_summary_id"] == first_id
    assert latest["superseded"] is False
    _matches(latest, latest_year.json())
    assert _money(latest["amount_paid"]) == _money(first["amount_paid"]) + Decimal("1.00")
    assert _money(latest["balance_due"]) == _money(first["balance_due"]) - Decimal("1.00")

    original_after = client.get(f"/api/v1/tax/tot/summaries/{summary_id}", headers=_auth(DEV_KEY))
    first_after = client.get(f"/api/v1/tax/tot/summaries/{first_id}", headers=_auth(DEV_KEY))
    assert original_after.status_code == 200
    assert first_after.status_code == 200
    _unchanged(original_after.json(), frozen)
    assert original_after.json()["superseded"] is True
    _unchanged(first_after.json(), first)
    assert first_after.json()["superseded"] is True
    listed = client.get("/api/v1/tax/tot/summaries", headers=_auth(DEV_KEY))
    assert listed.status_code == 200
    assert {item["id"] for item in listed.json()["summaries"]} == {summary_id, first_id, latest_id}

    stale = _amend(client, DEV_KEY, summary_id)
    assert stale.status_code == 409
    assert stale.json()["code"] == "tot_annual_summary_superseded"
    stale_first = _amend(client, DEV_KEY, first_id)
    assert stale_first.status_code == 409
    assert stale_first.json()["code"] == "tot_annual_summary_superseded"
    duplicate = client.post(
        "/api/v1/tax/tot/summaries",
        headers=_auth(DEV_KEY),
        json={"tax_year": 2026, "country_code": "SXM"},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "tot_annual_summary_already_filed"

    _switch(client, DEV_KEY, SIMPSON_BAY)
    for summary in (summary_id, first_id, latest_id):
        sibling = client.get(f"/api/v1/tax/tot/summaries/{summary}", headers=_auth(DEV_KEY))
        sibling_amend = _amend(client, DEV_KEY, summary)
        assert sibling.status_code == 404
        assert sibling.json()["code"] == "tot_annual_summary_not_found"
        assert sibling_amend.status_code == 404
        assert sibling_amend.json()["code"] == "tot_annual_summary_not_found"
    sibling_list = client.get("/api/v1/tax/tot/summaries", headers=_auth(DEV_KEY))
    assert sibling_list.status_code == 200
    assert sibling_list.json()["summaries"] == []

    _switch(client, OTHER_KEY, OTHER_TENANT)
    for summary in (summary_id, first_id, latest_id):
        foreign = client.get(f"/api/v1/tax/tot/summaries/{summary}", headers=_auth(OTHER_KEY))
        foreign_amend = _amend(client, OTHER_KEY, summary)
        assert foreign.status_code == 404
        assert foreign.json()["code"] == "tot_annual_summary_not_found"
        assert foreign_amend.status_code == 404
        assert foreign_amend.json()["code"] == "tot_annual_summary_not_found"
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
            for summary in (summary_id, first_id, latest_id):
                assert await other.fetch(
                    "SELECT id FROM allyanna.tot_annual_summaries WHERE id = $1",
                    UUID(summary),
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
                      'SXM', 2026, 'XCG', 1, 10.00, 3.00, 7.00, $1
                    )
                    """,
                    UUID(latest_id),
                )
        with pytest.raises(asyncpg.RaiseError, match="does not belong"):
            async with other.transaction():
                user = await repository.resolve_user(other, OTHER_KEY)
                assert user is not None
                await repository.set_user(other, user.id)
                await repository.set_scope(other, master_account_id=OTHER_FIRM, tenant_id=UUID(OTHER_TENANT))
                await other.execute(
                    """
                    INSERT INTO allyanna.tot_annual_summaries (
                      tenant_id, country_code, tax_year, currency_code, filing_count,
                      tax_due, amount_paid, balance_due, amends_summary_id
                    )
                    VALUES (
                      current_setting('allyanna.tenant_id', true)::uuid,
                      'SXM', 2026, 'XCG', 1, 10.00, 3.00, 7.00, $1
                    )
                    """,
                    UUID(latest_id),
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
            for summary in (summary_id, first_id, latest_id):
                assert await demo.fetchval(
                    "SELECT id FROM allyanna.tot_annual_summaries WHERE id = $1",
                    UUID(summary),
                ) is None
            await repository.set_scope(demo, master_account_id=HARBOUR, tenant_id=UUID(GREAT_BAY))
            original_tax = await demo.fetchval(
                "SELECT tax_due FROM allyanna.tot_annual_summaries WHERE id = $1",
                UUID(summary_id),
            )
            latest_paid = await demo.fetchval(
                "SELECT amount_paid FROM allyanna.tot_annual_summaries WHERE id = $1",
                UUID(latest_id),
            )
            assert Decimal(original_tax) == _money(frozen["tax_due"])
            assert Decimal(latest_paid) == _money(latest["amount_paid"])
    finally:
        await demo.close()
