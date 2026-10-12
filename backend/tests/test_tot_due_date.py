"""A filed return stores a due date, and an open balance can be past due."""

from decimal import Decimal

from fastapi.testclient import TestClient

GREAT_BAY = "22222222-2222-4222-8222-222222222221"
SIMPSON_BAY = "22222222-2222-4222-8222-222222222222"
OTHER_TENANT = "22222222-2222-4222-8222-222222222223"
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
            "vendor_name": "April Goods",
            "invoice_number": number,
            "invoice_date": invoice_date,
            "tax_year": 2026,
            "country_code": "SXM",
            "lines": [{"description": "Goods", "quantity": "2", "unit_price": "100.00"}],
        },
    )


def _file(client: TestClient, start: str, end: str, due_on: str | None) -> object:
    body: dict[str, object] = {
        "period_start": start,
        "period_end": end,
        "tax_year": 2026,
        "country_code": "SXM",
    }
    if due_on is not None:
        body["due_on"] = due_on
    return client.post("/api/v1/tax/tot/returns", headers=_auth(DEV_KEY), json=body)


def _balances(client: TestClient, key: str, as_of: str) -> object:
    return client.get(
        "/api/v1/tax/tot/balances",
        headers=_auth(key),
        params={"as_of": as_of},
    )


def test_open_balances_are_past_due_after_the_stored_date(client: TestClient) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    early = _file(client, "2026-04-10", "2026-04-14", "2026-04-09")
    assert early.status_code == 422
    assert early.json()["code"] == "invalid_worksheet"

    original = _invoice(client, "DUE-APR", "2026-04-12")
    settled_invoice = _invoice(client, "DUE-SETTLED", "2026-04-22")
    undated = _invoice(client, "DUE-OPEN", "2026-04-27")
    assert original.status_code == 201
    assert settled_invoice.status_code == 201
    assert undated.status_code == 201

    partial = _file(client, "2026-04-10", "2026-04-14", "2026-04-30")
    settled = _file(client, "2026-04-21", "2026-04-25", "2026-05-15")
    open_undated = _file(client, "2026-04-26", "2026-04-28", None)
    assert partial.status_code == 201
    assert settled.status_code == 201
    assert open_undated.status_code == 201
    assert partial.json()["tot_amount"] == "10.00"
    assert partial.json()["due_on"] == "2026-04-30"
    assert settled.json()["due_on"] == "2026-05-15"
    assert open_undated.json()["due_on"] is None
    partial_id = partial.json()["id"]
    settled_id = settled.json()["id"]
    undated_id = open_undated.json()["id"]

    paid = client.post(
        f"/api/v1/tax/tot/returns/{partial_id}/payments",
        headers=_auth(DEV_KEY),
        json={"amount": "4.00", "paid_on": "2026-04-20"},
    )
    closed = client.post(
        f"/api/v1/tax/tot/returns/{settled_id}/payments",
        headers=_auth(DEV_KEY),
        json={"amount": settled.json()["tot_amount"], "paid_on": "2026-04-25"},
    )
    assert paid.status_code == 201
    assert closed.status_code == 201

    stored = client.get(f"/api/v1/tax/tot/returns/{partial_id}", headers=_auth(DEV_KEY))
    assert stored.status_code == 200
    assert stored.json()["due_on"] == "2026-04-30"

    on_the_day = _balances(client, DEV_KEY, "2026-04-30")
    assert on_the_day.status_code == 200
    assert on_the_day.json()["as_of"] == "2026-04-30"
    due_day = {row["return_id"]: row for row in on_the_day.json()["returns"]}
    assert due_day[partial_id]["balance_due"] == "6.00"
    assert due_day[partial_id]["past_due"] is False
    assert due_day[settled_id]["past_due"] is False
    assert due_day[undated_id]["past_due"] is False

    later = _balances(client, DEV_KEY, "2026-05-01")
    assert later.status_code == 200
    rows = {row["return_id"]: row for row in later.json()["returns"]}
    assert rows[partial_id]["tax_due"] == "10.00"
    assert rows[partial_id]["amount_paid"] == "4.00"
    assert rows[partial_id]["balance_due"] == "6.00"
    assert rows[partial_id]["due_on"] == "2026-04-30"
    assert rows[partial_id]["past_due"] is True
    assert rows[settled_id]["balance_due"] == "0.00"
    assert rows[settled_id]["past_due"] is False
    assert rows[undated_id]["due_on"] is None
    assert rows[undated_id]["balance_due"] == "10.00"
    assert rows[undated_id]["past_due"] is False
    past_due_rows = [row for row in later.json()["returns"] if row["past_due"] is True]
    assert Decimal(later.json()["past_due_balance"]) == sum(
        (Decimal(row["balance_due"]) for row in past_due_rows),
        Decimal("0"),
    )
    assert later.json()["past_due_balance"] == "6.00"
    assert isinstance(later.json()["past_due_balance"], str)

    _switch(client, DEV_KEY, SIMPSON_BAY)
    sibling = _balances(client, DEV_KEY, "2026-05-01")
    assert sibling.status_code == 200
    assert partial_id not in {row["return_id"] for row in sibling.json()["returns"]}

    _switch(client, OTHER_KEY, OTHER_TENANT)
    foreign = _balances(client, OTHER_KEY, "2026-05-01")
    assert foreign.status_code == 200
    assert partial_id not in {row["return_id"] for row in foreign.json()["returns"]}
    assert foreign.json()["past_due_balance"] == "0.00"
