"""Tenant-scoped session probe route (wires X-Tenant-ID → DB dependency)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from app.deps import get_tenant_db, verify_tenant_access_token
from app.local_config import get_db_engine
from app.schemas import TenantSessionProbeResponse
from app.sqlite_db import TenantSqliteConnection

router = APIRouter(prefix="/api/v1")


@router.get("/tenant/session", response_model=TenantSessionProbeResponse)
async def probe_tenant_session(
    tenant_id: UUID = Depends(verify_tenant_access_token),
    conn=Depends(get_tenant_db),
) -> TenantSessionProbeResponse:
    """
    Confirm header validation + tenant isolation binding.

    SQLite: checks app-bound ``TenantSqliteConnection.tenant_id``.
    Postgres: checks ``app.current_tenant_id`` GUC (RLS).
    """
    if get_db_engine() == "sqlite" or isinstance(conn, TenantSqliteConnection):
        bound = getattr(conn, "tenant_id", None) == tenant_id
        return TenantSessionProbeResponse(tenant_id=tenant_id, rls_guc_bound=bound)

    row = await conn.execute(
        "SELECT NULLIF(current_setting('app.current_tenant_id', true), '')"
    )
    value = await row.fetchone()
    bound = value is not None and value[0] == str(tenant_id)
    return TenantSessionProbeResponse(tenant_id=tenant_id, rls_guc_bound=bound)
