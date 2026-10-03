# SQLite migrations (Windows desktop / local mode)

Postgres RLS migrations remain under `backend/migrations/*.sql` for Docker/server deploy.

Desktop mode applies:

```text
backend/migrations/sqlite/001_local_schema.sql
```

at startup into:

```text
%LOCALAPPDATA%\Allyanna\local_database.db
```

Tenant isolation is **application-enforced** (`tenant_id` on every ledger query / session bind). Tax rates are seeded for `tax_year=2026`, `country_code=SXM`.
