"""
FastAPI dependencies — tenant header validation and chat-compatible context.

``verify_tenant_access_token`` enforces a required ``X-Tenant-ID`` UUID (400 on
bad shape). ``get_tenant_context`` preserves the compliance chat contract:
Bearer stub **or** ``X-Tenant-ID`` + ``X-User-Id`` (invalid UUID → 400, not 422).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Optional, Union
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status

from app.db import get_tenant_db_session
from app.schemas import TenantContext
from app.sqlite_db import TenantSqliteConnection

try:
    from psycopg import AsyncConnection
except ImportError:  # pragma: no cover
    AsyncConnection = object  # type: ignore[misc,assignment]

TenantDbConn = Union[TenantSqliteConnection, "AsyncConnection"]

# Demo JWT-stub map: bearer token → tenant context (replace with real JWT verify).
_JWT_STUB_TENANTS: dict[str, TenantContext] = {
    "demo-tenant-token": TenantContext(
        tenant_id=UUID("11111111-1111-1111-1111-111111111111"),
        user_id=UUID("22222222-2222-2222-2222-222222222222"),
        role="owner",
    )
}


def _parse_bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


def _parse_tenant_uuid(raw: str) -> UUID:
    """Shared UUID parse used by header deps — always HTTP 400 on failure."""
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

    Use on routes that open a tenant-scoped DB session. Does not replace JWT /
    membership checks — only validates UUID shape before tenant binding.
    """
    return _parse_tenant_uuid(x_tenant_id)


async def get_tenant_context(
    authorization: Optional[str] = Header(default=None),
    x_tenant_id: Optional[str] = Header(default=None, alias="X-Tenant-ID"),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    x_role: str = Header(default="owner", alias="X-Role"),
) -> TenantContext:
    """
    Resolve Pillar 1 tenant context without breaking the chat API contract.

    Accepts either:
    - ``Authorization: Bearer <stub-token>`` (JWT stub), or
    - ``X-Tenant-ID`` + ``X-User-Id`` (+ optional ``X-Role``) headers.
    """
    token = _parse_bearer(authorization)
    if token:
        ctx = _JWT_STUB_TENANTS.get(token)
        if ctx is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or unknown bearer token.",
            )
        return ctx

    if x_tenant_id is not None and x_user_id is not None:
        tenant_uuid = _parse_tenant_uuid(x_tenant_id)
        try:
            user_uuid = UUID(x_user_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Invalid security headers: 'X-User-Id' formatting failure. "
                    "Must provide valid UUID layout."
                ),
            ) from exc
        return TenantContext(
            tenant_id=tenant_uuid,
            user_id=user_uuid,
            role=x_role,
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=(
            "Tenant context required. Provide Authorization: Bearer <token> "
            "or X-Tenant-ID and X-User-Id headers."
        ),
    )


async def get_tenant_db(
    tenant_id: UUID = Depends(verify_tenant_access_token),
) -> AsyncIterator[TenantDbConn]:
    """
    FastAPI dependency: validated ``X-Tenant-ID`` → tenant-scoped DB session.

    SQLite: app-bound tenant connection. Postgres: RLS GUC inside a transaction.
    """
    async with get_tenant_db_session(tenant_id) as conn:
        yield conn


TenantDep = Depends(get_tenant_context)
TenantDbDep = Depends(get_tenant_db)
