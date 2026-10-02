"""
Set Postgres GUC ``app.current_tenant_id`` for RLS session scoping.

Driver-agnostic: works with any connection that exposes ``execute`` /
``await execute`` accepting a SQL string (asyncpg, psycopg3, SQLAlchemy
AsyncConnection, etc.). No Postgres driver is required to import this module.

Usage (asyncpg example)::

    await set_current_tenant_id(conn, tenant_id)
    # ... tenant-scoped queries against invoices / payroll_records ...

Prefer ``SET LOCAL`` inside an open transaction so the GUC resets on commit/rollback.
"""

from __future__ import annotations

from typing import Any, Protocol, Union
from uuid import UUID
from inspect import isawaitable


class _SyncExec(Protocol):
    def execute(self, query: str, *args: Any, **kwargs: Any) -> Any: ...


class _AsyncExec(Protocol):
    async def execute(self, query: str, *args: Any, **kwargs: Any) -> Any: ...


ConnectionLike = Union[_SyncExec, _AsyncExec]


async def set_current_tenant_id(
    conn: ConnectionLike,
    tenant_id: UUID | str,
    *,
    local: bool = True,
) -> None:
    """
    Bind the current DB session (or transaction) to ``tenant_id`` for RLS.

    Parameters
    ----------
    conn:
        DB connection/cursor with an ``execute`` method.
    tenant_id:
        Tenant UUID (``UUID`` or string form).
    local:
        If True (default), use ``SET LOCAL`` (transaction-scoped).
        If False, use session-level ``SET``.
    """
    tid = str(tenant_id)
    # Validate UUID shape before interpolating into SET (no bind params for SET).
    UUID(tid)
    keyword = "LOCAL " if local else ""
    # SET does not accept parameterized placeholders in Postgres; value is a
    # validated UUID string only.
    sql = f"SET {keyword}app.current_tenant_id = '{tid}'"
    result = conn.execute(sql)
    if isawaitable(result):
        await result


def set_current_tenant_id_sync(
    conn: _SyncExec,
    tenant_id: UUID | str,
    *,
    local: bool = True,
) -> None:
    """Synchronous variant of :func:`set_current_tenant_id`."""
    tid = str(tenant_id)
    UUID(tid)
    keyword = "LOCAL " if local else ""
    conn.execute(f"SET {keyword}app.current_tenant_id = '{tid}'")
