"""
Tenant-scoped Postgres session helpers (Pillar 1 RLS).

Uses **psycopg v3 async** to match the async FastAPI surface. Open a
transaction, ``SET LOCAL app.current_tenant_id``, then yield the connection.
Credentials come only from the environment — never hardcode passwords or a
fully credentialed DATABASE_URL in source.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncIterator
from urllib.parse import quote_plus
from uuid import UUID

import psycopg
from psycopg import AsyncConnection

from app.db_tenant import set_current_tenant_id


def get_database_url(*, allow_missing: bool = False) -> str | None:
    """
    Resolve the runtime app DB URL from the environment.

    Preference order:
    1. ``ALLYANNA_DATABASE_URL`` (app role; preferred)
    2. ``DATABASE_URL``
    3. Discrete vars: ``ALLYANNA_DB_HOST`` / ``USER`` / ``PASSWORD`` / ``NAME``
       (also accepts standard ``PGHOST`` / ``PGUSER`` / ``PGPASSWORD`` /
       ``PGDATABASE`` / ``PGPORT``)
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
        "(or discrete ALLYANNA_DB_HOST / ALLYANNA_DB_USER / ALLYANNA_DB_PASSWORD / "
        "ALLYANNA_DB_NAME). Never commit credentials."
    )


@asynccontextmanager
async def get_tenant_db_session(tenant_id: UUID) -> AsyncIterator[AsyncConnection]:
    """
    Async context manager for a tenant-scoped transactional DB session.

    1. Connect with the least-privilege app role URL from the environment
    2. ``BEGIN`` (via ``connection.transaction()``)
    3. ``SET LOCAL app.current_tenant_id`` (RLS GUC; cleared on commit/rollback)
    4. Yield the open ``AsyncConnection`` for caller queries
    5. Commit on clean exit; roll back on error; always close the connection

    Sync boundary: callers must ``async with`` / ``await``. There is no sync
    psycopg2 path in this module — use :func:`app.db_tenant.set_current_tenant_id_sync`
    only when integrating a separate sync driver elsewhere.
    """
    database_url = get_database_url()
    assert database_url is not None  # get_database_url raises when missing

    conn = await psycopg.AsyncConnection.connect(database_url)
    try:
        async with conn.transaction():
            await set_current_tenant_id(conn, tenant_id, local=True)
            yield conn
    finally:
        await conn.close()
