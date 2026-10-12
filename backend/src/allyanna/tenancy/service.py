"""Authorize a master-account user and switch the active business profile."""

from typing import Any
from uuid import UUID

from allyanna.errors import (
    TenantAccessDenied,
    TenantContextRequired,
    TenantInactive,
    Unauthenticated,
)
from allyanna.tenancy.models import ActiveContext, ContextSnapshot, Tenant, User
from allyanna.tenancy.repository import TenancyRepository

Connection = Any


class TenancyService:
    def __init__(self, repository: TenancyRepository) -> None:
        self._repository = repository

    async def authenticate(self, conn: Connection, raw_key: str) -> User:
        user = await self._repository.resolve_user(conn, raw_key)
        if user is None:
            raise Unauthenticated("API key is not valid")
        await self._repository.set_user(conn, user.id)
        return user

    async def current_context(self, conn: Connection) -> ContextSnapshot:
        memberships = await self._repository.list_memberships(conn)
        tenants = await self._repository.list_tenants(conn)
        active = await self._repository.get_active_context(conn)
        return ContextSnapshot(memberships=memberships, tenants=tenants, active=active)

    async def require_active_tenant(self, conn: Connection) -> tuple[Tenant, ActiveContext]:
        active = await self._repository.get_active_context(conn)
        if active is None:
            raise TenantContextRequired("Switch to a business profile before calculating tax")
        tenant = await self._repository.get_tenant(conn, active.tenant_id)
        if tenant is None:
            raise TenantAccessDenied("Active business profile is not available to this account")
        if tenant.status != "active":
            raise TenantInactive("Active business profile is inactive")
        await self._repository.set_scope(
            conn,
            master_account_id=tenant.master_account_id,
            tenant_id=tenant.id,
        )
        return tenant, active

    async def switch(self, conn: Connection, tenant_id: UUID) -> ContextSnapshot:
        tenant = await self._repository.get_tenant(conn, tenant_id)
        if tenant is None:
            raise TenantAccessDenied("Tenant is not available to this account")
        if tenant.status != "active":
            raise TenantInactive("Tenant is inactive")
        previous = await self._repository.get_active_context(conn)
        await self._repository.set_scope(
            conn,
            master_account_id=tenant.master_account_id,
            tenant_id=tenant.id,
        )
        await self._repository.save_active_context(
            conn,
            master_account_id=tenant.master_account_id,
            tenant_id=tenant.id,
        )
        await self.write_audit(
            conn,
            action="context.switch",
            detail={
                "from_tenant_id": None if previous is None else str(previous.tenant_id),
                "to_tenant_id": str(tenant.id),
            },
        )
        return await self.current_context(conn)

    async def write_audit(self, conn: Connection, *, action: str, detail: dict[str, object]) -> None:
        await self._repository.write_audit(conn, action=action, detail=detail)
