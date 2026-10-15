"""List pay-due reminders for every summarized tax year on the active business."""

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


def _dues(client: TestClient, key: str) -> object:
    return client.get("/api/v1/tax/tot/dues", headers=_auth(key))


def _due(client: TestClient, key: str, summary_id: str) -> object:
    return client.get(
        f"/api/v1/tax/tot/summaries/{summary_id}/due",
        headers=_auth(key),
    )


def _money(value: object) -> Decimal:
    assert isinstance(value, str)
    return Decimal(value)


def _latest_2026(client: TestClient) -> dict[str, object]:
    listing = client.get("/api/v1/tax/tot/summaries", headers=_auth(DEV_KEY))
    assert listing.status_code == 200
    rows = [item for item in listing.json()["summaries"] if item["tax_year"] == 2026]
    latest = [item for item in rows if item["superseded"] is False]
    assert len(latest) == 1
    return latest[0]


@pytest.mark.asyncio
async def test_the_dues_list_shows_each_summarized_year_and_unfiled_gaps(
    client: TestClient, database_url: str
) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    latest = _latest_2026(client)
    single = _due(client, DEV_KEY, latest["id"])
    assert single.status_code == 200
    assert single.json()["has_unfiled_gap"] is True
    assert _money(single.json()["unfiled"]["amount_paid_change"]) == Decimal("1.00")

    listed = _dues(client, DEV_KEY)
    assert listed.status_code == 200
    body = listed.json()
    assert body["tenant_id"] == GREAT_BAY
    assert body["unfiled_count"] == 1
    assert len(body["dues"]) == 1
    row = body["dues"][0]
    assert row["tax_year"] == 2026
    assert row["country_code"] == "SXM"
    assert row["summary_id"] == latest["id"]
    assert row["has_unfiled_gap"] is True
    assert row["filed_tax_due"] == single.json()["filed_tax_due"]
    assert row["filed_amount_paid"] == single.json()["filed_amount_paid"]
    assert row["filed_balance_due"] == single.json()["filed_balance_due"]
    assert row["amount_due"] == single.json()["amount_due"]
    assert row["unfiled"] == single.json()["unfiled"]
    assert _money(body["amount_due"]) == _money(row["amount_due"])
    assert _money(body["amount_due"]) == sum(
        (_money(item["amount_due"]) for item in body["dues"]),
        Decimal("0.00"),
    )

    _switch(client, DEV_KEY, SIMPSON_BAY)
    sibling = _dues(client, DEV_KEY)
    assert sibling.status_code == 200
    assert sibling.json()["tenant_id"] == SIMPSON_BAY
    assert sibling.json()["dues"] == []
    assert sibling.json()["amount_due"] == "0.00"
    assert sibling.json()["unfiled_count"] == 0
    assert latest["id"] not in {item["summary_id"] for item in sibling.json()["dues"]}

    _switch(client, OTHER_KEY, OTHER_TENANT)
    foreign = _dues(client, OTHER_KEY)
    assert foreign.status_code == 200
    assert foreign.json()["tenant_id"] == OTHER_TENANT
    assert foreign.json()["dues"] == []
    assert foreign.json()["amount_due"] == "0.00"
    assert foreign.json()["unfiled_count"] == 0
    assert latest["id"] not in {item["summary_id"] for item in foreign.json()["dues"]}

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
