"""SQLite-backed POS store — durable multi-device source of truth."""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator
from uuid import uuid4

from app.pos.security import (
    force_seed_pin_change,
    hash_pin,
    hash_session,
    session_expiry,
    session_idle_minutes,
    verify_pin,
)

DEFAULT_TENANT_ID = os.getenv(
    "POS_DEFAULT_TENANT_ID",
    "11111111-1111-1111-1111-111111111111",
)

_lock = threading.RLock()


def _data_dir() -> Path:
    raw = os.getenv("POS_DATA_DIR", str(Path(__file__).resolve().parents[2] / "data"))
    path = Path(raw)
    path.mkdir(parents=True, exist_ok=True)
    return path


def db_path() -> Path:
    return _data_dir() / "pos.db"


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(db_path(), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with _lock, connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS tenants (
                id TEXT PRIMARY KEY,
                company_name TEXT NOT NULL,
                country_code TEXT NOT NULL DEFAULT 'SXM',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS staff (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                initials TEXT NOT NULL,
                pin_hash TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS pos_snapshots (
                tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
                payload TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                revision INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS sales_ledger (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                sale_json TEXT NOT NULL,
                paid_at TEXT NOT NULL,
                total_cents INTEGER NOT NULL,
                voided_at TEXT,
                void_reason TEXT,
                voided_by TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS audit_ledger (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                entry_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_staff_tenant ON staff(tenant_id);
            CREATE INDEX IF NOT EXISTS idx_sales_tenant ON sales_ledger(tenant_id, paid_at);
            CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
            """
        )
        _migrate_schema(conn)
        _ensure_seed(conn)


def _table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return {row["name"] for row in rows}


def _migrate_schema(conn: sqlite3.Connection) -> None:
    staff_cols = _table_columns(conn, "staff")
    if "must_change_pin" not in staff_cols:
        conn.execute(
            "ALTER TABLE staff ADD COLUMN must_change_pin INTEGER NOT NULL DEFAULT 0"
        )
    session_cols = _table_columns(conn, "sessions")
    if "last_seen_at" not in session_cols:
        conn.execute(
            "ALTER TABLE sessions ADD COLUMN last_seen_at TEXT NOT NULL DEFAULT ''"
        )
        conn.execute(
            "UPDATE sessions SET last_seen_at = created_at WHERE last_seen_at = '' OR last_seen_at IS NULL"
        )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _seed_snapshot() -> dict[str, Any]:
    """Minimal seed matching the frontend PersistedState shape."""
    guest_id = f"guest_{uuid4().hex[:8]}"
    table_id = f"table_{uuid4().hex[:8]}"
    now = int(time.time() * 1000)
    return {
        "version": 6,
        "menu": [],  # filled from client defaults on first push if empty
        "tables": [
            {
                "id": table_id,
                "label": "Table 12",
                "status": "open",
                "lines": [],
                "guests": [
                    {"id": guest_id, "name": "Guest 1", "paidAt": None, "payment": None}
                ],
                "tipAmountPreset": 0,
                "tipCents": 0,
                "serviceChargeEnabled": True,
                "serviceChargePercent": 5,
                "billGeneratedAt": None,
                "paidAt": None,
                "payment": None,
                "guestSignatureDataUrl": None,
                "guestPreferredPayment": None,
                "guestBillApprovedAt": None,
            }
        ],
        "activeTableId": table_id,
        "sales": [],
        "restaurant": {
            "name": "Authentic Jamaican Cuisine & Bar",
            "tagline": "Country kitchen · market-fresh · coal pot fire",
            "address": "14 Front Street, Philipsburg, Sint Maarten",
            "phone": "+1 (721) 555-0142",
            "taxId": "TAX-SXM-48291",
            "feedbackUrl": "https://savory.example/feedback",
        },
        "staff": [],  # staff come from staff table (no pins in snapshot)
        "activeStaffId": "",
        "nextOrderSeq": 1,
        "notifications": [],
        "settings": {
            "xcgPerUsd": 1.8,
            "defaultServiceChargePercent": 5,
            "shiftOpenedAt": None,
            "shiftClosedAt": None,
            "bumpAfterMinutes": 8,
            "idleLockMinutes": 5,
        },
        "auditLog": [],
        "updatedAt": now,
    }


def _ensure_seed(conn: sqlite3.Connection) -> None:
    row = conn.execute("SELECT id FROM tenants WHERE id = ?", (DEFAULT_TENANT_ID,)).fetchone()
    if row:
        return
    created = _now_iso()
    conn.execute(
        "INSERT INTO tenants (id, company_name, country_code, created_at) VALUES (?, ?, ?, ?)",
        (DEFAULT_TENANT_ID, "Authentic Jamaican Cuisine & Bar", "SXM", created),
    )
    must_change = 1 if force_seed_pin_change() else 0
    demo_staff = [
        ("staff_server", "Alex Morgan", "server", "AM", "1234"),
        ("staff_kitchen", "Casey Cook", "kitchen", "CC", "2222"),
        ("staff_bartender", "Morgan Rum", "bartender", "MR", "3333"),
        ("staff_admin", "Riley Admin", "admin", "RA", "5555"),
        ("staff_manager", "Jordan Lee", "manager", "JL", "9999"),
    ]
    for staff_id, name, role, initials, pin in demo_staff:
        conn.execute(
            """
            INSERT INTO staff
              (id, tenant_id, name, role, initials, pin_hash, active, created_at, must_change_pin)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                staff_id,
                DEFAULT_TENANT_ID,
                name,
                role,
                initials,
                hash_pin(pin),
                created,
                must_change,
            ),
        )
    snap = _seed_snapshot()
    snap["activeStaffId"] = "staff_server"
    conn.execute(
        """
        INSERT INTO pos_snapshots (tenant_id, payload, updated_at, revision)
        VALUES (?, ?, ?, 1)
        """,
        (DEFAULT_TENANT_ID, json.dumps(snap), snap["updatedAt"]),
    )


def list_public_staff(tenant_id: str) -> list[dict[str, Any]]:
    with _lock, connect() as conn:
        rows = conn.execute(
            """
            SELECT id, name, role, initials FROM staff
            WHERE tenant_id = ? AND active = 1
            ORDER BY name
            """,
            (tenant_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def authenticate(tenant_id: str, pin: str) -> dict[str, Any] | None:
    with _lock, connect() as conn:
        rows = conn.execute(
            """
            SELECT id, name, role, initials, pin_hash, must_change_pin
            FROM staff WHERE tenant_id = ? AND active = 1
            """,
            (tenant_id,),
        ).fetchall()
        match = None
        for row in rows:
            if verify_pin(pin, row["pin_hash"]):
                match = row
                break
        if not match:
            return None
        from app.pos.security import new_session_token

        token = new_session_token()
        expires = session_expiry()
        now = _now_iso()
        conn.execute(
            """
            INSERT INTO sessions
              (token_hash, tenant_id, staff_id, expires_at, created_at, last_seen_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (hash_session(token), tenant_id, match["id"], expires.isoformat(), now, now),
        )
        return {
            "token": token,
            "expiresAt": expires.isoformat(),
            "mustChangePin": bool(match["must_change_pin"]),
            "staff": {
                "id": match["id"],
                "name": match["name"],
                "role": match["role"],
                "initials": match["initials"],
            },
            "tenantId": tenant_id,
        }


def resolve_session(token: str) -> dict[str, Any] | None:
    if not token:
        return None
    th = hash_session(token)
    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat()
    idle_minutes = session_idle_minutes()
    with _lock, connect() as conn:
        row = conn.execute(
            """
            SELECT s.tenant_id, s.staff_id, s.expires_at, s.last_seen_at,
                   st.name, st.role, st.initials, st.must_change_pin
            FROM sessions s
            JOIN staff st ON st.id = s.staff_id
            WHERE s.token_hash = ? AND st.active = 1
            """,
            (th,),
        ).fetchone()
        if not row:
            return None
        if row["expires_at"] < now:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (th,))
            return None
        last_seen_raw = row["last_seen_at"] or row["expires_at"]
        try:
            last_seen = datetime.fromisoformat(last_seen_raw.replace("Z", "+00:00"))
            if last_seen.tzinfo is None:
                last_seen = last_seen.replace(tzinfo=timezone.utc)
        except ValueError:
            last_seen = now_dt
        if idle_minutes > 0:
            idle_seconds = (now_dt - last_seen).total_seconds()
            if idle_seconds > idle_minutes * 60:
                conn.execute("DELETE FROM sessions WHERE token_hash = ?", (th,))
                return None
        conn.execute(
            "UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?",
            (now, th),
        )
        return {
            "tenantId": row["tenant_id"],
            "mustChangePin": bool(row["must_change_pin"]),
            "staff": {
                "id": row["staff_id"],
                "name": row["name"],
                "role": row["role"],
                "initials": row["initials"],
            },
        }


def change_staff_pin(
    tenant_id: str,
    staff_id: str,
    *,
    current_pin: str,
    new_pin: str,
) -> dict[str, Any]:
    if current_pin == new_pin:
        raise ValueError("New PIN must differ from the current PIN")
    # Block well-known demo PINs after rotation so pilots are not left on defaults
    demo_pins = {"1234", "2222", "5555", "9999"}
    if new_pin in demo_pins:
        raise ValueError("Choose a PIN that is not a published demo default")
    with _lock, connect() as conn:
        row = conn.execute(
            """
            SELECT pin_hash FROM staff
            WHERE id = ? AND tenant_id = ? AND active = 1
            """,
            (staff_id, tenant_id),
        ).fetchone()
        if not row:
            raise KeyError("staff not found")
        if not verify_pin(current_pin, row["pin_hash"]):
            raise PermissionError("Current PIN is incorrect")
        conn.execute(
            """
            UPDATE staff
            SET pin_hash = ?, must_change_pin = 0
            WHERE id = ? AND tenant_id = ?
            """,
            (hash_pin(new_pin), staff_id, tenant_id),
        )
    return {"status": "ok", "mustChangePin": False}


def revoke_session(token: str) -> None:
    with _lock, connect() as conn:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (hash_session(token),))


def get_snapshot(tenant_id: str) -> dict[str, Any] | None:
    with _lock, connect() as conn:
        row = conn.execute(
            "SELECT payload, updated_at, revision FROM pos_snapshots WHERE tenant_id = ?",
            (tenant_id,),
        ).fetchone()
        if not row:
            return None
        payload = json.loads(row["payload"])
        staff_rows = conn.execute(
            """
            SELECT id, name, role, initials FROM staff
            WHERE tenant_id = ? AND active = 1
            ORDER BY name
            """,
            (tenant_id,),
        ).fetchall()
        # Merge live staff (no pins) into snapshot for the client
        payload["staff"] = [
            {
                "id": s["id"],
                "name": s["name"],
                "role": s["role"],
                "initials": s["initials"],
                "pin": "",  # never expose secrets
            }
            for s in staff_rows
        ]
        payload["updatedAt"] = row["updated_at"]
        payload["_revision"] = row["revision"]
        # Overlay ledger sales (immutable source)
        sales = conn.execute(
            """
            SELECT sale_json FROM sales_ledger
            WHERE tenant_id = ? AND voided_at IS NULL
            ORDER BY paid_at DESC
            """,
            (tenant_id,),
        ).fetchall()
        payload["sales"] = [json.loads(r["sale_json"]) for r in sales]
        audits = conn.execute(
            """
            SELECT entry_json FROM audit_ledger
            WHERE tenant_id = ?
            ORDER BY created_at DESC
            LIMIT 200
            """,
            (tenant_id,),
        ).fetchall()
        payload["auditLog"] = [json.loads(r["entry_json"]) for r in audits]
        return payload


def put_snapshot(
    tenant_id: str,
    payload: dict[str, Any],
    *,
    expected_revision: int | None = None,
) -> dict[str, Any]:
    """Last-write with optional optimistic revision check."""
    with _lock, connect() as conn:
        row = conn.execute(
            "SELECT revision, updated_at FROM pos_snapshots WHERE tenant_id = ?",
            (tenant_id,),
        ).fetchone()
        if not row:
            raise KeyError("tenant snapshot missing")
        if expected_revision is not None and int(row["revision"]) != int(expected_revision):
            raise ConflictError(int(row["revision"]), int(row["updated_at"]))

        # Strip client sales/audit — ledger is authoritative
        clean = dict(payload)
        clean.pop("sales", None)
        clean.pop("auditLog", None)
        clean.pop("_revision", None)
        # Never accept pin fields from client into staff snapshot
        if "staff" in clean:
            del clean["staff"]

        updated_at = int(time.time() * 1000)
        clean["updatedAt"] = updated_at
        revision = int(row["revision"]) + 1
        conn.execute(
            """
            UPDATE pos_snapshots
            SET payload = ?, updated_at = ?, revision = ?
            WHERE tenant_id = ?
            """,
            (json.dumps(clean), updated_at, revision, tenant_id),
        )
    result = get_snapshot(tenant_id)
    assert result is not None
    return result


class ConflictError(Exception):
    def __init__(self, revision: int, updated_at: int):
        self.revision = revision
        self.updated_at = updated_at
        super().__init__("snapshot conflict")


def record_sale(tenant_id: str, sale: dict[str, Any]) -> dict[str, Any]:
    sale_id = sale.get("id") or f"sale_{uuid4().hex[:10]}"
    sale = {**sale, "id": sale_id}
    with _lock, connect() as conn:
        existing = conn.execute(
            "SELECT id FROM sales_ledger WHERE id = ?", (sale_id,)
        ).fetchone()
        if existing:
            raise ValueError("sale already recorded")
        conn.execute(
            """
            INSERT INTO sales_ledger
              (id, tenant_id, sale_json, paid_at, total_cents, voided_at, void_reason, voided_by, created_at)
            VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?)
            """,
            (
                sale_id,
                tenant_id,
                json.dumps(sale),
                sale.get("paidAt") or _now_iso(),
                int(sale.get("totalCents") or 0),
                _now_iso(),
            ),
        )
    return sale


def void_sale(
    tenant_id: str,
    sale_id: str,
    *,
    reason: str,
    voided_by: str,
) -> dict[str, Any]:
    with _lock, connect() as conn:
        row = conn.execute(
            """
            SELECT sale_json, voided_at FROM sales_ledger
            WHERE id = ? AND tenant_id = ?
            """,
            (sale_id, tenant_id),
        ).fetchone()
        if not row:
            raise KeyError("sale not found")
        if row["voided_at"]:
            raise ValueError("sale already voided")
        conn.execute(
            """
            UPDATE sales_ledger
            SET voided_at = ?, void_reason = ?, voided_by = ?
            WHERE id = ? AND tenant_id = ?
            """,
            (_now_iso(), reason, voided_by, sale_id, tenant_id),
        )
        sale = json.loads(row["sale_json"])
    append_audit(
        tenant_id,
        {
            "id": f"audit_{uuid4().hex[:10]}",
            "kind": "void_payment",
            "reason": reason,
            "staffId": voided_by,
            "staffName": voided_by,
            "createdAt": _now_iso(),
            "details": f"Voided sale {sale_id} · {sale.get('tableLabel', '')}",
            "tableLabel": sale.get("tableLabel"),
        },
    )
    return {**sale, "voided": True, "voidReason": reason}


def append_audit(tenant_id: str, entry: dict[str, Any]) -> dict[str, Any]:
    entry_id = entry.get("id") or f"audit_{uuid4().hex[:10]}"
    entry = {**entry, "id": entry_id, "createdAt": entry.get("createdAt") or _now_iso()}
    with _lock, connect() as conn:
        conn.execute(
            """
            INSERT INTO audit_ledger (id, tenant_id, entry_json, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (entry_id, tenant_id, json.dumps(entry), entry["createdAt"]),
        )
    return entry


def create_staff(
    tenant_id: str,
    *,
    name: str,
    role: str,
    pin: str,
    initials: str,
) -> dict[str, Any]:
    staff_id = f"staff_{uuid4().hex[:10]}"
    with _lock, connect() as conn:
        conn.execute(
            """
            INSERT INTO staff (id, tenant_id, name, role, initials, pin_hash, active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?)
            """,
            (staff_id, tenant_id, name, role, initials, hash_pin(pin), _now_iso()),
        )
    return {"id": staff_id, "name": name, "role": role, "initials": initials, "pin": ""}


def deactivate_staff(tenant_id: str, staff_id: str) -> None:
    with _lock, connect() as conn:
        conn.execute(
            "UPDATE staff SET active = 0 WHERE id = ? AND tenant_id = ?",
            (staff_id, tenant_id),
        )


def bootstrap_menu_if_empty(tenant_id: str, menu: list[dict[str, Any]], tables: list[dict[str, Any]]) -> dict[str, Any]:
    snap = get_snapshot(tenant_id)
    if not snap:
        raise KeyError("missing snapshot")
    if snap.get("menu"):
        return snap
    snap["menu"] = menu
    if tables:
        snap["tables"] = tables
        snap["activeTableId"] = tables[0]["id"]
    return put_snapshot(tenant_id, snap, expected_revision=snap.get("_revision"))
