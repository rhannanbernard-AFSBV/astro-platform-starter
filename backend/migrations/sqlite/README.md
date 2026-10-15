# SQLite migrations (Windows desktop / local mode)

Postgres RLS migrations remain under `backend/migrations/*.sql` for Docker/server deploy.

Desktop mode applies:

```text
backend/migrations/sqlite/001_local_schema.sql
```

via Frankie's helpers in `backend/app/local_ledger.py`:

- `get_local_db_connection()` → `%LOCALAPPDATA%\Allyanna\allyanna_ledger.db`
- `initialize_local_sxm_tables()` → creates `local_invoices`, `local_payroll_records`, SXM tax tables

## Ledger filename

| File | Status |
|------|--------|
| `allyanna_ledger.db` | **Current** (Frankie) |
| `local_database.db` | Legacy from the first desktop PR revision — auto-renamed once on open |

Tenant isolation is **application-enforced** (`tenant_id` on every ledger query / session bind). Money columns are **TEXT** (Decimal strings), not REAL. Tax rates are seeded for `tax_year=2026`, `country_code=SXM`.
