"""Tenant queries. Each one constrains rows with the session user or tenant id.

Row-level security is the backstop. The predicates stay in the SQL so a query
cannot widen access by forgetting them. set_scope is only called after the
service has confirmed the user may enter that business profile.
"""

import hashlib
import json
from typing import Any
from uuid import UUID

from allyanna.money import as_decimal
from allyanna.tenancy.models import ActiveContext, Membership, Tenant, User

Connection = Any


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


class TenancyRepository:
    async def resolve_user(self, conn: Connection, raw_key: str) -> User | None:
        row = await conn.fetchrow(
            """
            SELECT user_id, email, display_name
            FROM allyanna.resolve_api_key($1)
            """,
            hash_api_key(raw_key),
        )
        if row is None:
            return None
        return User(id=row["user_id"], email=row["email"], display_name=row["display_name"])

    async def set_user(self, conn: Connection, user_id: UUID) -> None:
        """Bind the caller for this transaction. The third argument is is_local."""
        await conn.execute(
            "SELECT set_config('allyanna.user_id', $1, true)",
            str(user_id),
        )

    async def set_scope(self, conn: Connection, *, master_account_id: UUID, tenant_id: UUID) -> None:
        await conn.execute(
            "SELECT set_config('allyanna.master_account_id', $1, true)",
            str(master_account_id),
        )
        await conn.execute(
            "SELECT set_config('allyanna.tenant_id', $1, true)",
            str(tenant_id),
        )

    async def list_memberships(self, conn: Connection) -> tuple[Membership, ...]:
        rows = await conn.fetch(
            """
            SELECT membership.master_account_id, account.name, account.slug, membership.role
            FROM allyanna.master_account_members AS membership
            INNER JOIN allyanna.master_accounts AS account
              ON account.id = membership.master_account_id
            WHERE membership.user_id = current_setting('allyanna.user_id', true)::uuid
            ORDER BY account.name
            """
        )
        return tuple(
            Membership(
                master_account_id=row["master_account_id"],
                name=row["name"],
                slug=row["slug"],
                role=row["role"],
            )
            for row in rows
        )

    async def list_tenants(self, conn: Connection) -> tuple[Tenant, ...]:
        rows = await conn.fetch(
            """
            SELECT id, master_account_id, legal_name, trade_name, country_code,
                   crib_number, status, ov_employer_rate
            FROM allyanna.tenants
            WHERE EXISTS (
              SELECT 1
              FROM allyanna.master_account_members AS membership
              WHERE membership.master_account_id = tenants.master_account_id
                AND membership.user_id = current_setting('allyanna.user_id', true)::uuid
            )
            ORDER BY legal_name
            """
        )
        return tuple(_tenant_from_row(row) for row in rows)

    async def get_tenant(self, conn: Connection, tenant_id: UUID) -> Tenant | None:
        row = await conn.fetchrow(
            """
            SELECT id, master_account_id, legal_name, trade_name, country_code,
                   crib_number, status, ov_employer_rate
            FROM allyanna.tenants
            WHERE id = $1
              AND EXISTS (
                SELECT 1
                FROM allyanna.master_account_members AS membership
                WHERE membership.master_account_id = tenants.master_account_id
                  AND membership.user_id = current_setting('allyanna.user_id', true)::uuid
              )
            """,
            tenant_id,
        )
        if row is None:
            return None
        return _tenant_from_row(row)

    async def get_active_context(self, conn: Connection) -> ActiveContext | None:
        row = await conn.fetchrow(
            """
            SELECT user_id, master_account_id, tenant_id, switched_at
            FROM allyanna.user_active_contexts
            WHERE user_id = current_setting('allyanna.user_id', true)::uuid
            """
        )
        if row is None:
            return None
        return ActiveContext(
            user_id=row["user_id"],
            master_account_id=row["master_account_id"],
            tenant_id=row["tenant_id"],
            switched_at=row["switched_at"],
        )

    async def save_active_context(
        self,
        conn: Connection,
        *,
        master_account_id: UUID,
        tenant_id: UUID,
    ) -> ActiveContext:
        row = await conn.fetchrow(
            """
            INSERT INTO allyanna.user_active_contexts (
              user_id, master_account_id, tenant_id, switched_at
            )
            VALUES (
              current_setting('allyanna.user_id', true)::uuid,
              $1,
              $2,
              now()
            )
            ON CONFLICT (user_id) DO UPDATE
            SET master_account_id = EXCLUDED.master_account_id,
                tenant_id = EXCLUDED.tenant_id,
                switched_at = now()
            RETURNING user_id, master_account_id, tenant_id, switched_at
            """,
            master_account_id,
            tenant_id,
        )
        return ActiveContext(
            user_id=row["user_id"],
            master_account_id=row["master_account_id"],
            tenant_id=row["tenant_id"],
            switched_at=row["switched_at"],
        )

    async def write_audit(self, conn: Connection, *, action: str, detail: dict[str, object]) -> None:
        await conn.execute(
            """
            INSERT INTO allyanna.audit_logs (tenant_id, actor_user_id, action, detail)
            VALUES (
              current_setting('allyanna.tenant_id', true)::uuid,
              current_setting('allyanna.user_id', true)::uuid,
              $1,
              $2::jsonb
            )
            """,
            action,
            json.dumps(detail),
        )


def _tenant_from_row(row: Any) -> Tenant:
    rate = row["ov_employer_rate"]
    return Tenant(
        id=row["id"],
        master_account_id=row["master_account_id"],
        legal_name=row["legal_name"],
        trade_name=row["trade_name"],
        country_code=row["country_code"],
        crib_number=row["crib_number"],
        status=row["status"],
        ov_employer_rate=None if rate is None else as_decimal(rate),
    )
