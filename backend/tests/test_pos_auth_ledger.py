"""POS auth + immutable sales ledger tests (SQLite)."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Isolate test DB before app import side effects
TEST_DIR = Path(__file__).resolve().parent / "_tmp_pos_data"
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


def _login(client: TestClient, pin: str = "1234") -> str:
    res = client.post("/pos/auth/login", json={"pin": pin})
    assert res.status_code == 200, res.text
    return res.json()["token"]


def test_health(client: TestClient):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_login_rejects_bad_pin(client: TestClient):
    res = client.post("/pos/auth/login", json={"pin": "0000"})
    assert res.status_code == 401


def test_login_and_state_roundtrip(client: TestClient):
    token = _login(client, "9999")
    headers = {"Authorization": f"Bearer {token}"}
    res = client.get("/pos/state", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert "state" in body
    assert body["state"]["version"] == 6
    # staff pins never returned as real secrets
    for user in body["state"]["staff"]:
        assert user.get("pin") in ("", None)


def test_sales_are_immutable_void_only(client: TestClient):
    token = _login(client, "1234")
    headers = {"Authorization": f"Bearer {token}"}
    sale = {
        "id": "sale_test_1",
        "tableId": "t1",
        "tableLabel": "Table 12",
        "paidAt": "2026-10-09T00:00:00+00:00",
        "subtotalCents": 1000,
        "serviceChargeCents": 50,
        "tipCents": 0,
        "totalCents": 1050,
        "payment": {
            "method": "card",
            "cashCents": 0,
            "cardCents": 1050,
            "changeDueCents": 0,
            "paidAt": "2026-10-09T00:00:00+00:00",
        },
        "serverName": "Alex",
        "itemCount": 1,
        "orderNumbers": [],
        "guestName": None,
        "guestId": None,
    }
    res = client.post("/pos/sales", headers=headers, json={"sale": sale})
    assert res.status_code == 200
    # duplicate rejected
    res2 = client.post("/pos/sales", headers=headers, json={"sale": sale})
    assert res2.status_code == 409

    # server cannot void
    res3 = client.post(
        "/pos/sales/sale_test_1/void",
        headers=headers,
        json={"reason": "Guest left"},
    )
    assert res3.status_code == 403

    manager = _login(client, "9999")
    mheaders = {"Authorization": f"Bearer {manager}"}
    res4 = client.post(
        "/pos/sales/sale_test_1/void",
        headers=mheaders,
        json={"reason": "Guest left"},
    )
    assert res4.status_code == 200
    state = client.get("/pos/state", headers=mheaders).json()["state"]
    assert all(s["id"] != "sale_test_1" for s in state["sales"])


def test_bartender_can_post_sale(client: TestClient):
    token = _login(client, "3333")
    headers = {"Authorization": f"Bearer {token}"}
    sale = {
        "id": "sale_bar_1",
        "tableId": "tab1",
        "tableLabel": "Tab · Guest",
        "paidAt": "2026-10-09T01:00:00+00:00",
        "subtotalCents": 900,
        "serviceChargeCents": 45,
        "tipCents": 200,
        "totalCents": 1145,
        "compCents": 0,
        "payment": {
            "method": "cash",
            "cashCents": 1200,
            "cardCents": 0,
            "changeDueCents": 55,
            "paidAt": "2026-10-09T01:00:00+00:00",
        },
        "serverName": "Morgan Rum",
        "itemCount": 1,
        "orderNumbers": ["ORD-20261009-0001"],
        "guestName": "Guest",
        "guestId": None,
    }
    res = client.post("/pos/sales", headers=headers, json={"sale": sale})
    assert res.status_code == 200, res.text
    assert res.json()["sale"]["id"] == "sale_bar_1"


def test_kitchen_cannot_post_sale(client: TestClient):
    token = _login(client, "2222")
    headers = {"Authorization": f"Bearer {token}"}
    sale = {
        "id": "sale_kitchen_blocked",
        "tableId": "t1",
        "tableLabel": "Table 12",
        "paidAt": "2026-10-09T01:00:00+00:00",
        "subtotalCents": 100,
        "serviceChargeCents": 0,
        "tipCents": 0,
        "totalCents": 100,
        "payment": {
            "method": "cash",
            "cashCents": 100,
            "cardCents": 0,
            "changeDueCents": 0,
            "paidAt": "2026-10-09T01:00:00+00:00",
        },
        "serverName": "Casey",
        "itemCount": 1,
        "orderNumbers": [],
        "guestName": None,
        "guestId": None,
    }
    res = client.post("/pos/sales", headers=headers, json={"sale": sale})
    assert res.status_code == 403


def test_optimistic_concurrency(client: TestClient):
    token = _login(client, "9999")
    headers = {"Authorization": f"Bearer {token}"}
    current = client.get("/pos/state", headers=headers).json()
    rev = current["revision"]
    state = current["state"]
    state["restaurant"]["phone"] = "+1 (721) 555-9999"
    ok = client.put(
        "/pos/state",
        headers=headers,
        json={"state": state, "expectedRevision": rev},
    )
    assert ok.status_code == 200
    conflict = client.put(
        "/pos/state",
        headers=headers,
        json={"state": state, "expectedRevision": rev},
    )
    assert conflict.status_code == 409
