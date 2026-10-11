"""Owner reliability helpers — backups and operational summaries."""

from __future__ import annotations

import csv
import io
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.pos import store


def create_backup_file() -> Path:
    """Copy the live SQLite DB into a timestamped backup under POS_DATA_DIR/backups."""
    src = store.db_path()
    if not src.exists():
        raise FileNotFoundError("POS database not found")
    backup_dir = store._data_dir() / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest = backup_dir / f"pos-{stamp}.db"
    # Ensure WAL is checkpointed for a consistent copy
    with store.connect() as conn:
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    shutil.copy2(src, dest)
    return dest


def sales_csv(tenant_id: str) -> str:
    snap = store.get_snapshot(tenant_id)
    sales = (snap or {}).get("sales") or []
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "id",
            "tableLabel",
            "paidAt",
            "subtotalCents",
            "serviceChargeCents",
            "tipCents",
            "totalCents",
            "method",
            "cashCents",
            "cardCents",
            "serverName",
            "guestName",
        ]
    )
    for sale in sales:
        payment = sale.get("payment") or {}
        writer.writerow(
            [
                sale.get("id"),
                sale.get("tableLabel"),
                sale.get("paidAt"),
                sale.get("subtotalCents"),
                sale.get("serviceChargeCents"),
                sale.get("tipCents"),
                sale.get("totalCents"),
                payment.get("method"),
                payment.get("cashCents"),
                payment.get("cardCents"),
                sale.get("serverName"),
                sale.get("guestName"),
            ]
        )
    return buf.getvalue()


def owner_summary(tenant_id: str) -> dict[str, Any]:
    snap = store.get_snapshot(tenant_id)
    if not snap:
        return {"status": "missing"}
    sales = snap.get("sales") or []
    settings = snap.get("settings") or {}
    open_tables = [
        t for t in (snap.get("tables") or []) if t.get("status") in ("open", "partial")
    ]
    total_cents = sum(int(s.get("totalCents") or 0) for s in sales)
    backup_dir = store._data_dir() / "backups"
    backups = sorted(backup_dir.glob("pos-*.db"), reverse=True) if backup_dir.exists() else []
    return {
        "status": "ok",
        "restaurant": (snap.get("restaurant") or {}).get("name"),
        "openTables": len(open_tables),
        "saleCount": len(sales),
        "salesTotalCents": total_cents,
        "shiftOpenedAt": settings.get("shiftOpenedAt"),
        "shiftClosedAt": settings.get("shiftClosedAt"),
        "staffCount": len(snap.get("staff") or []),
        "revision": snap.get("_revision"),
        "dbPath": str(store.db_path()),
        "recentBackups": [b.name for b in backups[:5]],
        "updatedAt": snap.get("updatedAt"),
    }
