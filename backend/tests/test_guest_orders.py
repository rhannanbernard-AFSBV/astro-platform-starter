"""Phase B — public guest order menu + place + status."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

TEST_DIR = Path(__file__).resolve().parent / "_tmp_guest_order_data"
TEST_DIR.mkdir(exist_ok=True)
os.environ["POS_DATA_DIR"] = str(TEST_DIR)
os.environ["POS_FORCE_PIN_CHANGE"] = "0"
os.environ["POS_SESSION_IDLE_MINUTES"] = "0"
db_file = TEST_DIR / "pos.db"
if db_file.exists():
    db_file.unlink()

from app.main import app  # noqa: E402
from app.pos import store  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    os.environ["POS_DATA_DIR"] = str(TEST_DIR)
    os.environ["POS_FORCE_PIN_CHANGE"] = "0"
    os.environ["POS_SESSION_IDLE_MINUTES"] = "0"
    if db_file.exists():
        db_file.unlink()
    store.init_db()
    yield
    if db_file.exists():
        db_file.unlink()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_guest_menu_fallback(client: TestClient):
    res = client.get("/pos/guest/menu")
    assert res.status_code == 200
    body = res.json()
    assert body["source"] == "fallback"
    assert len(body["items"]) >= 4
    assert body["payAtCounter"] is True


def test_guest_place_and_status(client: TestClient):
    menu = client.get("/pos/guest/menu").json()["items"]
    first = menu[0]
    res = client.post(
        "/pos/guest/orders",
        json={
            "fulfillment": "table",
            "tableLabel": "14",
            "guestName": "Marley",
            "lines": [{"menuItemId": first["id"], "quantity": 2}],
        },
    )
    assert res.status_code == 200, res.text
    order = res.json()
    assert order["token"].startswith("go_")
    assert order["phase"] == "received"
    assert order["orderNumber"]
    assert "Table" in (order["label"] or "")

    status = client.get(f"/pos/guest/orders/{order['token']}")
    assert status.status_code == 200
    assert status.json()["token"] == order["token"]
    assert len(status.json()["lines"]) == 1

    # Appears on POS snapshot for kitchen
    token = client.post("/pos/auth/login", json={"pin": "2222"}).json()["token"]
    snap = client.get("/pos/state", headers={"Authorization": f"Bearer {token}"}).json()["state"]
    guest_tables = [t for t in snap["tables"] if t.get("guestOrderToken") == order["token"]]
    assert len(guest_tables) == 1
    assert guest_tables[0]["lines"][0]["kitchenStatus"] == "queued"
    assert any(n.get("audienceRole") == "kitchen" for n in snap["notifications"])


def test_guest_pickup_order(client: TestClient):
    menu = client.get("/pos/guest/menu").json()["items"]
    drink = next((i for i in menu if i["category"] == "Drinks"), menu[-1])
    res = client.post(
        "/pos/guest/orders",
        json={
            "fulfillment": "pickup",
            "guestName": "Pat",
            "lines": [{"menuItemId": drink["id"], "quantity": 1}],
        },
    )
    assert res.status_code == 200, res.text
    assert res.json()["fulfillment"] == "pickup"
    assert "Pickup" in (res.json()["label"] or "")


def test_guest_rejects_empty(client: TestClient):
    res = client.post(
        "/pos/guest/orders",
        json={"fulfillment": "table", "lines": []},
    )
    assert res.status_code == 422
