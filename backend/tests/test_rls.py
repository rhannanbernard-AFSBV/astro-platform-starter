"""Postgres row-level security for the service role.

Session variables are transaction-local. Every check below sets them inside
the same transaction that runs the query, which is also how the API does it.
"""

from uuid import UUID

import asyncpg
import pytest

from allyanna.tenancy.repository import TenancyRepository
from allyanna.tenancy.service import TenancyService

GREAT_BAY = UUID("22222222-2222-4222-8222-222222222221")
SIMPSON_BAY = UUID("22222222-2222-4222-8222-222222222222")
OTHER_TENANT = UUID("22222222-2222-4222-8222-222222222223")
HARBOUR = UUID("11111111-1111-4111-8111-111111111111")
OTHER_FIRM = UUID("11111111-1111-4111-8111-111111111112")
DEV_KEY = "allyanna-dev-key"
OTHER_KEY = "allyanna-other-key"


@pytest.mark.asyncio
async def test_app_role_cannot_read_credentials_or_write_tax_tables(database_url: str) -> None:
    conn = await asyncpg.connect(database_url)
    try:
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await conn.fetch("SELECT email FROM allyanna.users")
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await conn.execute("UPDATE allyanna.tot_rates SET rate = 0.09000000")
    finally:
        await conn.close()


@pytest.mark.asyncio
async def test_unset_session_sees_no_tenant_rows(database_url: str) -> None:
    conn = await asyncpg.connect(database_url)
    try:
        assert await conn.fetch("SELECT id FROM allyanna.tenants") == []
        assert await conn.fetch("SELECT id FROM allyanna.audit_logs") == []
    finally:
        await conn.close()


@pytest.mark.asyncio
async def test_switch_audit_is_isolated_by_active_tenant_and_firm(database_url: str, admin_sql) -> None:
    admin_sql("DELETE FROM allyanna.audit_logs")
    conn = await asyncpg.connect(database_url)
    repository = TenancyRepository()
    service = TenancyService(repository)
    try:
        async with conn.transaction():
            user = await repository.resolve_user(conn, DEV_KEY)
            assert user is not None
            await repository.set_user(conn, user.id)
            await service.switch(conn, GREAT_BAY)
            visible = await conn.fetch("SELECT tenant_id FROM allyanna.audit_logs")
            assert [row["tenant_id"] for row in visible] == [GREAT_BAY]
            await repository.set_scope(conn, master_account_id=HARBOUR, tenant_id=SIMPSON_BAY)
            assert await conn.fetch("SELECT id FROM allyanna.audit_logs") == []

        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            async with conn.transaction():
                user = await repository.resolve_user(conn, DEV_KEY)
                assert user is not None
                await repository.set_user(conn, user.id)
                await repository.set_scope(conn, master_account_id=HARBOUR, tenant_id=OTHER_TENANT)
                await repository.write_audit(conn, action="context.switch", detail={"leaked": True})

        async with conn.transaction():
            user = await repository.resolve_user(conn, DEV_KEY)
            assert user is not None
            await repository.set_user(conn, user.id)
            await repository.set_scope(conn, master_account_id=HARBOUR, tenant_id=GREAT_BAY)
            assert await conn.fetchval("SELECT count(*) FROM allyanna.audit_logs") == 1
    finally:
        await conn.close()

    other = await asyncpg.connect(database_url)
    try:
        async with other.transaction():
            user = await repository.resolve_user(other, OTHER_KEY)
            assert user is not None
            await repository.set_user(other, user.id)
            await repository.set_scope(other, master_account_id=OTHER_FIRM, tenant_id=GREAT_BAY)
            assert await other.fetch("SELECT id FROM allyanna.audit_logs") == []
    finally:
        await other.close()
