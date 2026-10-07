"""
Set Postgres GUC ``app.current_tenant_id`` for RLS session scoping.

Aligned with PR #3 / #4 — driver-agnostic SET LOCAL helper.
"""

from __future__ import annotations

from inspect import isawaitable
from typing import Any, Protocol, Union
from uuid import UUID


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
    """Bind the current DB session/transaction to ``tenant_id`` for RLS."""
    tid = str(tenant_id)
    UUID(tid)
    keyword = "LOCAL " if local else ""
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
