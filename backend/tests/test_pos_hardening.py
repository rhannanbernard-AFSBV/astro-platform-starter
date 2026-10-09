"""Pilot hardening: rate limit, PIN change, idle session, backups."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

TEST_DIR = Path(__file__).resolve().parent / "_tmp_pos_hardening"
TEST_DIR.mkdir(exist_ok=True)
os.environ["POS_DATA_DIR"] = str(TEST_DIR)
os.environ["POS_FORCE_PIN_CHANGE"] = "1"
os.environ["POS_PIN_MAX_ATTEMPTS"] = "3"
os.environ["POS_PIN_WINDOW_SECONDS"] = "300"
os.environ["POS_PIN_LOCKOUT_SECONDS"] = "60"
os.environ["POS_SESSION_IDLE_MINUTES"] = "30"
os.environ["POS_HIDE_DEMO_CREDENTIALS"] = "1"
db_file = TEST_DIR / "pos.db"
if db_file.exists():
    db_file.unlink()

from app.main import app  # noqa: E402
from app.pos import rate_limit, store  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    os.environ["POS_FORCE_PIN_CHANGE"] = "1"
    os.environ["POS_PIN_MAX_ATTEMPTS"] = "3"
    os.environ["POS_PIN_LOCKOUT_SECONDS"] = "60"
    os.environ["POS_SESSION_IDLE_MINUTES"] = "30"
    os.environ["POS_HIDE_DEMO_CREDENTIALS"] = "1"
    rate_limit.reset_for_tests()
    if db_file.exists():
        db_file.unlink()
    store.init_db()
    yield
    if db_file.exists():
        db_file.unlink()
    rate_limit.reset_for_tests()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _login(client: TestClient, pin: str = "9999") -> dict:
    res = client.post("/pos/auth/login", json={"pin": pin})
    assert res.status_code == 200, res.text
    return res.json()


def test_config_exposes_hardening_flags(client: TestClient):
    res = client.get("/pos/config")
    assert res.status_code == 200
    body = res.json()
    assert body["hideDemoCredentials"] is True
    assert body["idleMinutes"] == 30
    assert body["pinMaxAttempts"] == 3


def test_pin_rate_limit_locks_after_failures(client: TestClient):
    for _ in range(3):
        bad = client.post("/pos/auth/login", json={"pin": "0000"})
        assert bad.status_code in (401, 429)
    locked = client.post("/pos/auth/login", json={"pin": "0000"})
    assert locked.status_code == 429
    detail = locked.json()["detail"]
    assert detail["code"] == "pin_locked"
    # Even correct PIN is blocked while locked
    still = client.post("/pos/auth/login", json={"pin": "9999"})
    assert still.status_code == 429


def test_must_change_pin_blocks_mutations(client: TestClient):
    session = _login(client, "1234")
    assert session["mustChangePin"] is True
    headers = {"Authorization": f"Bearer {session['token']}"}
    state = client.get("/pos/state", headers=headers).json()
    blocked = client.put(
        "/pos/state",
        headers=headers,
        json={"state": state["state"], "expectedRevision": state["revision"]},
    )
    assert blocked.status_code == 403
    assert blocked.json()["detail"]["code"] == "must_change_pin"


def test_change_pin_clears_gate_and_rejects_demo_defaults(client: TestClient):
    session = _login(client, "9999")
    headers = {"Authorization": f"Bearer {session['token']}"}
    bad = client.post(
        "/pos/auth/change-pin",
        headers=headers,
        json={"currentPin": "9999", "newPin": "1234"},
    )
    assert bad.status_code == 400
    bad_bartender = client.post(
        "/pos/auth/change-pin",
        headers=headers,
        json={"currentPin": "9999", "newPin": "3333"},
    )
    assert bad_bartender.status_code == 400
    ok = client.post(
        "/pos/auth/change-pin",
        headers=headers,
        json={"currentPin": "9999", "newPin": "4321"},
    )
    assert ok.status_code == 200
    assert ok.json()["mustChangePin"] is False
    # Re-login with new PIN
    rate_limit.reset_for_tests()
    again = client.post("/pos/auth/login", json={"pin": "4321"})
    assert again.status_code == 200
    assert again.json()["mustChangePin"] is False
    headers2 = {"Authorization": f"Bearer {again.json()['token']}"}
    state = client.get("/pos/state", headers=headers2).json()
    put = client.put(
        "/pos/state",
        headers=headers2,
        json={"state": state["state"], "expectedRevision": state["revision"]},
    )
    assert put.status_code == 200


def test_manager_backup_and_ops_summary(client: TestClient):
    session = _login(client, "9999")
    headers = {"Authorization": f"Bearer {session['token']}"}
    # Change PIN so manager ops that require auth still work; backup only needs manager
    client.post(
        "/pos/auth/change-pin",
        headers=headers,
        json={"currentPin": "9999", "newPin": "7788"},
    )
    rate_limit.reset_for_tests()
    session = _login(client, "7788")
    headers = {"Authorization": f"Bearer {session['token']}"}
    backup = client.post("/pos/ops/backup", headers=headers)
    assert backup.status_code == 200
    assert backup.json()["filename"].startswith("pos-")
    summary = client.get("/pos/ops/summary", headers=headers)
    assert summary.status_code == 200
    assert summary.json()["status"] == "ok"
    assert len(summary.json()["recentBackups"]) >= 1
    csv_res = client.get("/pos/ops/sales.csv", headers=headers)
    assert csv_res.status_code == 200
    assert "totalCents" in csv_res.text


def test_idle_session_revokes(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    session = _login(client, "9999")
    token = session["token"]
    from app.pos.security import hash_session

    th = hash_session(token)
    with store.connect() as conn:
        conn.execute(
            "UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?",
            ("2020-01-01T00:00:00+00:00", th),
        )
    monkeypatch.setenv("POS_SESSION_IDLE_MINUTES", "1")
    resolved = store.resolve_session(token)
    assert resolved is None
    with store.connect() as conn:
        row = conn.execute(
            "SELECT 1 FROM sessions WHERE token_hash = ?", (th,)
        ).fetchone()
        assert row is None
