"""
FastAPI dependencies — tenant header validation for payroll DB routes.

``verify_tenant_access_token`` enforces a required ``X-Tenant-ID`` UUID
(HTTP 400 on bad shape). Aligned with PR #4.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from psycopg import AsyncConnection

from app.db import get_tenant_db_session


def _parse_tenant_uuid(raw: str) -> UUID:
    """Shared UUID parse — always HTTP 400 on failure."""
    try:
        return UUID(raw)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Invalid security headers: 'X-Tenant-ID' formatting failure. "
                "Must provide valid UUID layout."
            ),
        ) from exc


async def verify_tenant_access_token(
    x_tenant_id: str = Header(
        ...,
        alias="X-Tenant-ID",
        description=(
            "The unique UUID string corresponding to the active company workspace"
        ),
    ),
) -> UUID:
    """
    Require and validate ``X-Tenant-ID`` for multi-tenant API entrypoints.

    Use on routes that open a tenant-scoped DB session. Invalid UUID → 400.
    """
    return _parse_tenant_uuid(x_tenant_id)


async def get_tenant_db(
    tenant_id: UUID = Depends(verify_tenant_access_token),
) -> AsyncIterator[AsyncConnection]:
    """Validated ``X-Tenant-ID`` → tenant-scoped DB session (RLS GUC bound)."""
    async with get_tenant_db_session(tenant_id) as conn:
        yield conn
