"""
Embedded SQLite engine for Allyanna desktop / local mode.

Uses Frankie's ledger helpers (:mod:`app.local_ledger`) for path + schema init,
then exposes async tenant-scoped sessions for FastAPI routes.

Tenant isolation (Pillar 1 without Postgres RLS):
- Every session is bound to a ``tenant_id``
- Ledger writes must include that ``tenant_id`` (``local_invoices`` /
  ``local_payroll_records``)
- Ledger reads should filter ``WHERE tenant_id = ?``

Money stays as TEXT in SQLite; callers pass ``Decimal`` / str and Python math
uses ``decimal.Decimal`` exclusively.
"""

from __future__ import annotations

import re
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncIterator, Sequence
from uuid import UUID

import aiosqlite

from app.local_ledger import get_local_db_path, initialize_local_sxm_tables
from app.paths import get_sqlite_db_path

# Convert psycopg-style ``%s`` placeholders to SQLite ``?``.
_PCT_PLACEHOLDER = re.compile(r"%s")


def _to_sqlite_sql(sql: str) -> str:
    return _PCT_PLACEHOLDER.sub("?", sql)


class TenantSqliteConnection:
    """
    Thin async wrapper around ``aiosqlite.Connection`` with tenant binding.

    Mimics the small subset of the psycopg async API used by Allyanna routes
    (``execute`` → result with ``fetchone`` / ``fetchall``).
    """

    def __init__(self, conn: aiosqlite.Connection, tenant_id: UUID) -> None:
        self._conn = conn
        self.tenant_id = tenant_id
        self.engine = "sqlite"

    async def execute(
        self, sql: str, params: Sequence[Any] | None = None
    ) -> "_SqliteResult":
        cursor = await self._conn.execute(_to_sqlite_sql(sql), params or ())
        return _SqliteResult(cursor)

    async def executescript(self, script: str) -> None:
        await self._conn.executescript(script)


class _SqliteResult:
    def __init__(self, cursor: aiosqlite.Cursor) -> None:
        self._cursor = cursor

    async def fetchone(self) -> Any:
        return await self._cursor.fetchone()

    async def fetchall(self) -> list[Any]:
        return await self._cursor.fetchall()


async def apply_sqlite_schema(db_path: Path | None = None) -> Path:
    """
    Create parent dirs and apply Frankie's local SXM schema.

    ``db_path`` is accepted for call-site compatibility; the sync initializer
    resolves the canonical ledger path (including legacy rename).
    """
    if db_path is not None:
        db_path.parent.mkdir(parents=True, exist_ok=True)
    return initialize_local_sxm_tables()


@asynccontextmanager
async def get_tenant_sqlite_session(
    tenant_id: UUID,
) -> AsyncIterator[TenantSqliteConnection]:
    """
    Open a tenant-scoped SQLite transaction against ``allyanna_ledger.db``.

    Ensures Frankie's schema exists, then yields a connection bound to
    ``tenant_id``. Commit on success; rollback on error.
    """
    db_path = get_local_db_path()
    if not db_path.is_file():
        initialize_local_sxm_tables()
        db_path = get_sqlite_db_path()

    conn = await aiosqlite.connect(db_path.as_posix())
    await conn.execute("PRAGMA foreign_keys = ON;")
    try:
        await conn.execute("BEGIN")
        wrapped = TenantSqliteConnection(conn, tenant_id)
        # Ensure tenant row exists for FK inserts (demo seed covers default).
        await wrapped.execute(
            "INSERT OR IGNORE INTO tenants (id, company_name, country_code) "
            "VALUES (%s, %s, %s)",
            (str(tenant_id), f"Tenant {tenant_id}", "SXM"),
        )
        yield wrapped
        await conn.commit()
    except Exception:
        await conn.rollback()
        raise
    finally:
        await conn.close()


def new_row_id() -> str:
    """Generate a UUID string primary key for SQLite rows."""
    return str(uuid.uuid4())
