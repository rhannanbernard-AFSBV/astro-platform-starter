# Allyanna Postgres migrations

SQL migrations for Pillar 1 (RLS / `tenant_id`), Pillar 2 (`tax_rates` /
`wage_tax_brackets`), and Pillar 3 (`tenant_users` roles).

## Required environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes (migrate) | Postgres connection URI for applying migrations (superuser or role that can create tables/roles). |
| `ALLYANNA_APP_PASSWORD` | Yes (migrate) | Password for the least-privilege login role `allyanna_app_user`. **Never commit this value.** |
| `ALLYANNA_DATABASE_URL` | App runtime | Connection URI the API should use as `allyanna_app_user` (not a migration superuser). |

## Local Postgres via Docker

From `backend/`:

```bash
cp .env.example .env
# edit ALLYANNA_APP_PASSWORD / POSTGRES_PASSWORD if desired
docker compose up -d
```

Default compose exposes Postgres on `localhost:5432` with database `allyanna`.

## Apply `001_multi_tenant_rls.sql`

```bash
export DATABASE_URL='postgresql://postgres:postgres@localhost:5432/allyanna'
export ALLYANNA_APP_PASSWORD='replace-with-a-strong-secret'

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v app_password="$ALLYANNA_APP_PASSWORD" \
  -f migrations/001_multi_tenant_rls.sql
```

Or from the repo root:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v app_password="$ALLYANNA_APP_PASSWORD" \
  -f backend/migrations/001_multi_tenant_rls.sql
```

The migration refuses to run if `-v app_password=...` is missing.

## Pillar 2 tax tables

Migration creates and seeds:

- `tax_rates` — PK `(tax_year, country_code)` with TOT % and SZV cap/splits
- `wage_tax_brackets` — progressive bands FK'd to `tax_rates`

Runtime loaders (`app/tax_tables.py`):

1. **JSON cache (default for unit tests / offline):**  
   `backend/data/{country_code}_tax_tables_{tax_year}.json` via `get_tax_rates(tax_year, country_code)`
2. **Postgres:** `get_tax_rates_from_db(conn, tax_year, country_code)` reads the tables above and falls back to JSON if the row is missing

Never hardcode rates inside math formulas — always pass a `TaxRatesSXM` loaded from one of these sources.

## Session tenant context (required for RLS)

Every API DB session that reads/writes `invoices` or `payroll_records` must set:

```sql
SET LOCAL app.current_tenant_id = '<tenant-uuid>';
```

Without this GUC, policies match no rows (empty / unset → deny-by-default for ledger data).

Python helper: `backend/app/db_tenant.py` — called automatically by
`app.db.get_tenant_db_session`.

## Role privileges

`allyanna_app_user` receives `USAGE` on `public` and:

- DML on `tenants`, `users`, `tenant_users`, `invoices`, `payroll_records`
- `SELECT` on `tax_rates`, `wage_tax_brackets`

No superuser, createdb, or creatrole. Ledger tables use `FORCE ROW LEVEL SECURITY`.
