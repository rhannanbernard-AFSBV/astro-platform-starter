"""Pay-due rows name the file-unfiled, year-statement, and payment paths."""

from decimal import Decimal

from fastapi.testclient import TestClient

GREAT_BAY = "22222222-2222-4222-8222-222222222221"
DEV_KEY = "allyanna-dev-key"


def _auth(key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {key}"}


def _switch(client: TestClient, key: str, tenant_id: str) -> None:
    switched = client.post(
        "/api/v1/context/switch",
        headers=_auth(key),
        json={"tenant_id": tenant_id},
    )
    assert switched.status_code == 200


def _money(value: object) -> Decimal:
    assert isinstance(value, str)
    return Decimal(value)


def test_dues_actions_name_file_year_and_payment_paths(client: TestClient) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    listed = client.get("/api/v1/tax/tot/dues", headers=_auth(DEV_KEY))
    assert listed.status_code == 200
    body = listed.json()
    assert body["dues"]
    row = next(item for item in body["dues"] if item["tax_year"] == 2026)
    actions = row["actions"]
    assert actions["year_statement_path"] == (
        "/api/v1/tax/tot/statements?tax_year=2026&country_code=SXM"
    )
    year = client.get(actions["year_statement_path"], headers=_auth(DEV_KEY))
    assert year.status_code == 200
    assert year.json()["tax_year"] == 2026
    assert year.json()["country_code"] == "SXM"

    if row["has_unfiled_gap"]:
        assert actions["can_file_unfiled"] is True
        assert actions["file_unfiled_path"] == (
            f"/api/v1/tax/tot/summaries/{row['summary_id']}/unfiled"
        )
    else:
        assert actions["can_file_unfiled"] is False
        assert actions["file_unfiled_path"] is None

    single = client.get(
        f"/api/v1/tax/tot/summaries/{row['summary_id']}/due",
        headers=_auth(DEV_KEY),
    )
    assert single.status_code == 200
    assert single.json()["actions"] == actions

    balances = client.get("/api/v1/tax/tot/balances", headers=_auth(DEV_KEY))
    assert balances.status_code == 200
    open_ids = {
        item["return_id"]
        for item in balances.json()["returns"]
        if item["tax_year"] == 2026
        and item["country_code"] == "SXM"
        and _money(item["balance_due"]) > Decimal("0")
    }
    action_ids = {item["return_id"] for item in actions["open_returns"]}
    assert action_ids == open_ids
    for open_row in actions["open_returns"]:
        assert _money(open_row["balance_due"]) > Decimal("0")
        assert open_row["payment_path"] == (
            f"/api/v1/tax/tot/returns/{open_row['return_id']}/payments"
        )
        payment_list = client.get(open_row["payment_path"], headers=_auth(DEV_KEY))
        assert payment_list.status_code == 200
        assert payment_list.json()["tot_return_id"] == open_row["return_id"]
