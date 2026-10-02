# Allyanna backend

Postgres multi-tenant schema / RLS migrations live under [`migrations/`](./migrations/).

See [`migrations/README.md`](./migrations/README.md) for:

- required env vars (`DATABASE_URL`, `ALLYANNA_APP_PASSWORD`, `ALLYANNA_DATABASE_URL`)
- how to apply `001_multi_tenant_rls.sql`
- session requirement: `SET app.current_tenant_id` (helper: `app/db_tenant.py`)

The SXM compliance FastAPI app (tax engine, OCR, chat) is tracked separately (PR #2) and will merge alongside this package tree.
