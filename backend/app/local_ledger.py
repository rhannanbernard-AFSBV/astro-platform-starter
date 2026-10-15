"""
Frankie's local SQLite ledger helpers for the Windows desktop package.

DB file (Windows AppData):
  ``%LOCALAPPDATA%\\Allyanna\\allyanna_ledger.db``

Money columns are TEXT (Decimal strings) — never float/REAL in Python math.
Every ledger row carries ``tenant_id`` for SaaS compatibility + query scoping.
SXM tax tables are seeded by tax_year + country_code (Pillar 2).
"""

from __future__ import annotations

import os
import shutil
import sqlite3
from pathlib import Path

from app.paths import (
    DB_FILENAME,
    LEGACY_DB_FILENAME,
    bundled_sqlite_migration_path,
    ensure_allyanna_data_dir,
    get_sqlite_db_path,
)


def get_local_db_path() -> Path:
    """Resolve ``allyanna_ledger.db`` under AppData (or env overrides)."""
    return get_sqlite_db_path()


def _maybe_migrate_legacy_db_filename(db_path: Path) -> None:
    """
    One-time rename: ``local_database.db`` → ``allyanna_ledger.db``.

    If the new file already exists, leave it alone (do not overwrite).
    """
    if db_path.is_file():
        return
    legacy = db_path.parent / LEGACY_DB_FILENAME
    if legacy.is_file():
        shutil.move(str(legacy), str(db_path))


def get_local_db_connection() -> sqlite3.Connection:
    """
    Establish a local connection to the embedded SQLite ledger file.

    Saves data natively inside the Windows User AppData scope.
    """
    # Create path: C:\\Users\\<Username>\\AppData\\Local\\Allyanna\\
    # Honors ALLYANNA_DATA_DIR / non-Windows fallbacks via ensure_allyanna_data_dir.
    if os.environ.get("ALLYANNA_DATA_DIR", "").strip() or (
        os.name != "nt" and not os.environ.get("LOCALAPPDATA", "").strip()
    ):
        app_data_dir = ensure_allyanna_data_dir()
    else:
        app_data_dir = (
            Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "Allyanna"
        )
        app_data_dir.mkdir(parents=True, exist_ok=True)

    if os.environ.get("ALLYANNA_SQLITE_PATH", "").strip():
        db_path = get_sqlite_db_path()
        db_path.parent.mkdir(parents=True, exist_ok=True)
    else:
        db_path = app_data_dir / DB_FILENAME

    _maybe_migrate_legacy_db_filename(db_path)

    # Establish single-file database runtime
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def initialize_local_sxm_tables() -> Path:
    """
    Build the Sint Maarten tax and payroll tables locally on the laptop hard drive.

    Applies ``migrations/sqlite/001_local_schema.sql``:
      - tenants / users / tenant_users
      - tax_rates / wage_tax_brackets (tax_year + country_code ``SXM``)
      - local_invoices / local_payroll_records (Frankie's names + tenant_id)

    Money columns are TEXT (not REAL) so Python ``decimal.Decimal`` is lossless.
    Idempotent (CREATE IF NOT EXISTS / INSERT OR IGNORE).
    """
    migration = bundled_sqlite_migration_path()
    if not migration.is_file():
        raise FileNotFoundError(f"SQLite migration missing: {migration}")

    conn = get_local_db_connection()
    try:
        conn.executescript(migration.read_text(encoding="utf-8"))
        conn.commit()
        rows = conn.execute("PRAGMA database_list").fetchall()
        main = next((r for r in rows if r[1] == "main"), None)
        return Path(main[2]) if main and main[2] else get_local_db_path()
    finally:
        conn.close()
