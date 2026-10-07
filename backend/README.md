# Allyanna tenant-scoped Postgres session

FastAPI helpers that bind every DB transaction to `app.current_tenant_id` (Pillar 1 RLS) and validate the `X-Tenant-ID` header.

## Layout

```
backend/
  app/
    db.py            # env DATABASE_URL + async get_tenant_db_session
    db_tenant.py     # SET LOCAL app.current_tenant_id (aligned with RLS PR)
    deps.py          # verify_tenant_access_token + get_tenant_context + get_tenant_db
    schemas.py       # TenantContext (merge-friendly with compliance core)
    routes/tenant.py # optional /api/v1/tenant/session probe
    main.py
  tests/
    test_tenant_deps.py
```

## Environment

| Variable | Purpose |
|----------|---------|
| `ALLYANNA_DATABASE_URL` | Preferred app-role connection URI (never commit) |
| `DATABASE_URL` | Fallback URI |
| `ALLYANNA_DB_HOST` / `USER` / `PASSWORD` / `NAME` | Discrete alternative (or `PG*`) |

Missing URL raises a clear `RuntimeError` at connect time (non-test).

## Driver note (async boundary)

This package uses **psycopg v3 async** (`AsyncConnection`) to match FastAPI `async def` routes. Callers must `async with get_tenant_db_session(...)` or `Depends(get_tenant_db)`. There is no sync `psycopg2` path here; `db_tenant.set_current_tenant_id_sync` remains available for other sync drivers.

## Setup / tests

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest -q
```

## Chat API contract

`get_tenant_context` still accepts `Authorization: Bearer demo-tenant-token` **or** `X-Tenant-ID` + `X-User-Id`. DB-scoped routes should use `Depends(verify_tenant_access_token)` / `Depends(get_tenant_db)` so RLS GUC binding is mandatory.
