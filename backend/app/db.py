"""
Tenant-scoped database sessions — Postgres (RLS) or embedded SQLite.

Desktop / local mode uses SQLite at
``%LOCALAPPDATA%\\Allyanna\\local_database.db`` with app-enforced
``tenant_id`` scoping (SQLite has no Postgres RLS).

Server mode keeps psycopg async + ``SET LOCAL app.current_tenant_id``.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncIterator, Union
from urllib.parse import quote_plus
from uuid import UUID

from app.db_tenant import set_current_tenant_id
from app.local_config import get_db_engine
from app.sqlite_db import TenantSqliteConnection, get_tenant_sqlite_session

try:
    import psycopg
    from psycopg import AsyncConnection
except ImportError:  # pragma: no cover - optional when sqlite-only bundle
    psycopg = None  # type: ignore[assignment]
    AsyncConnection = object  # type: ignore[misc,assignment]

TenantConnection = Union[TenantSqliteConnection, "AsyncConnection"]


def get_database_url(*, allow_missing: bool = False) -> str | None:
    """
    Resolve the runtime Postgres app DB URL from the environment.

    Preference order:
    1. ``ALLYANNA_DATABASE_URL`` (app role; preferred)
    2. ``DATABASE_URL``
    3. Discrete vars: ``ALLYANNA_DB_HOST`` / ``USER`` / ``PASSWORD`` / ``NAME``
    """
    url = os.environ.get("ALLYANNA_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if url:
        return url

    host = os.environ.get("ALLYANNA_DB_HOST") or os.environ.get("PGHOST")
    user = os.environ.get("ALLYANNA_DB_USER") or os.environ.get("PGUSER")
    password = os.environ.get("ALLYANNA_DB_PASSWORD") or os.environ.get("PGPASSWORD")
    dbname = os.environ.get("ALLYANNA_DB_NAME") or os.environ.get("PGDATABASE")
    port = os.environ.get("ALLYANNA_DB_PORT") or os.environ.get("PGPORT") or "5432"

    if host and user and password is not None and dbname:
        return (
            f"postgresql://{quote_plus(user)}:{quote_plus(password)}"
            f"@{host}:{port}/{dbname}"
        )

    if allow_missing:
        return None

    raise RuntimeError(
        "Database URL not configured. Set ALLYANNA_DATABASE_URL or DATABASE_URL "
        "(or discrete ALLYANNA_DB_* vars), or use ALLYANNA_DB_ENGINE=sqlite / "
        "ALLYANNA_LOCAL_MODE=1 for embedded SQLite."
    )


@asynccontextmanager
async def get_tenant_db_session(tenant_id: UUID) -> AsyncIterator[TenantConnection]:
    """
    Async context manager for a tenant-scoped transactional DB session.

    SQLite: app-bound ``tenant_id`` on ``TenantSqliteConnection``.
    Postgres: ``SET LOCAL app.current_tenant_id`` inside a transaction (RLS).
    """
    engine = get_db_engine()
    if engine == "sqlite":
        async with get_tenant_sqlite_session(tenant_id) as conn:
            yield conn
        return

    if psycopg is None:
        raise RuntimeError(
            "psycopg is not installed but ALLYANNA_DB_ENGINE=postgres was selected."
        )

    database_url = get_database_url()
    assert database_url is not None

    conn = await psycopg.AsyncConnection.connect(database_url)
    try:
        async with conn.transaction():
            await set_current_tenant_id(conn, tenant_id, local=True)
            yield conn
    finally:
        await conn.close()
