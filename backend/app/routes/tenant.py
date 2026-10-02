"""Tenant-scoped session probe route (wires X-Tenant-ID → DB dependency)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from psycopg import AsyncConnection

from app.deps import get_tenant_db, verify_tenant_access_token
from app.schemas import TenantSessionProbeResponse

router = APIRouter(prefix="/api/v1")


@router.get("/tenant/session", response_model=TenantSessionProbeResponse)
async def probe_tenant_session(
    tenant_id: UUID = Depends(verify_tenant_access_token),
    conn: AsyncConnection = Depends(get_tenant_db),
) -> TenantSessionProbeResponse:
    """
    Confirm header validation + tenant GUC binding.

    Requires a live Postgres URL in the environment. Unit tests mock the
    session dependency instead of calling this route against a real DB.
    """
    row = await conn.execute(
        "SELECT NULLIF(current_setting('app.current_tenant_id', true), '')"
    )
    value = await row.fetchone()
    bound = value is not None and value[0] == str(tenant_id)
    return TenantSessionProbeResponse(tenant_id=tenant_id, rls_guc_bound=bound)
