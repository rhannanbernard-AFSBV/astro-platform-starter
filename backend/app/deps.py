"""FastAPI dependencies — real tenant resolution (header / JWT stub)."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status

from app.schemas import TenantContext

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


async def get_tenant_context(
    authorization: Optional[str] = Header(default=None),
    x_tenant_id: Optional[UUID] = Header(default=None, alias="X-Tenant-Id"),
    x_user_id: Optional[UUID] = Header(default=None, alias="X-User-Id"),
    x_role: str = Header(default="owner", alias="X-Role"),
) -> TenantContext:
    """
    Resolve Pillar 1 tenant context.

    Accepts either:
    - ``Authorization: Bearer <stub-token>`` (JWT stub), or
    - ``X-Tenant-Id`` + ``X-User-Id`` (+ optional ``X-Role``) headers.
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
        return TenantContext(
            tenant_id=x_tenant_id,
            user_id=x_user_id,
            role=x_role,
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=(
            "Tenant context required. Provide Authorization: Bearer <token> "
            "or X-Tenant-Id and X-User-Id headers."
        ),
    )


# Callable dependency alias used by routes: Depends(get_tenant_context)
TenantDep = Depends(get_tenant_context)
