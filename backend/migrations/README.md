# Allyanna Postgres migrations (multi-tenant RLS)

SQL migrations for Pillar 1 (RLS / `tenant_id`) and Pillar 3 (`tenant_users` roles).

## Required environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | Postgres connection URI for applying migrations (superuser or role that can create tables/roles). |
| `ALLYANNA_APP_PASSWORD` | Yes | Password for the least-privilege login role `allyanna_app_user`. **Never commit this value.** |
| `ALLYANNA_DATABASE_URL` | App runtime | Connection URI the API should use as `allyanna_app_user` (not a migration superuser). |

Optional at runtime (application layer, not this SQL file):

| Variable | Purpose |
|----------|---------|
| `ALLYANNA_DB_DSN` | Alias some deploys may use instead of `ALLYANNA_DATABASE_URL`. |

## Apply `001_multi_tenant_rls.sql`

```bash
export DATABASE_URL='postgresql://postgres@localhost:5432/allyanna'
export ALLYANNA_APP_PASSWORD='replace-with-a-strong-secret'

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v app_password="$ALLYANNA_APP_PASSWORD" \
  -f backend/migrations/001_multi_tenant_rls.sql
```

The migration refuses to run if `-v app_password=...` is missing.

## Session tenant context (required for RLS)

Every API DB session that reads/writes `invoices` or `payroll_records` must set:

```sql
SET app.current_tenant_id = '<tenant-uuid>';
-- or, preferably, transaction-local:
SET LOCAL app.current_tenant_id = '<tenant-uuid>';
```

Without this GUC, policies match no rows (empty / unset → deny-by-default for ledger data).

Python helper (driver-agnostic stub): `backend/app/db_tenant.py` — call `set_current_tenant_id(conn, tenant_id)` after checkout / before queries. Wire it when a Postgres driver lands (PR #2 compliance core has no DB driver yet).

## Role privileges

`allyanna_app_user` receives `USAGE` on `public` and `SELECT/INSERT/UPDATE/DELETE` on:

- `tenants`, `users`, `tenant_users`
- `invoices`, `payroll_records`

No superuser, createdb, or creatrole. Ledger tables use `FORCE ROW LEVEL SECURITY`.
