# Allyanna monthly payroll run

`POST /api/v1/payroll/process-monthly-run` — Decimal wage/SZV math (Pillar 2
tax tables) + tenant-scoped `payroll_records` INSERT (Pillar 1 RLS).

## Layout

```
backend/
  data/sxm_tax_tables_2026.json   # Pillar 2 mock tax-table seed
  app/
    tax_engine.py                 # calculate_sxm_wage_tax_and_szv (Decimal)
    tax_tables.py                 # get_tax_rates(tax_year, country_code)
    schemas.py                    # request/response + TaxRatesSXM
    db.py / db_tenant.py          # async get_tenant_db_session + SET LOCAL
    deps.py                       # verify_tenant_access_token (X-Tenant-ID)
    routes/payroll.py             # process-monthly-run
    main.py
  tests/test_payroll_run.py
```

Independent of compliance-core (#2), RLS (#3), and tenant-session (#4) PRs —
module names/APIs are aligned so merges compose cleanly.

## Environment

| Variable | Purpose |
|----------|---------|
| `ALLYANNA_DATABASE_URL` / `DATABASE_URL` | App-role Postgres URI (never commit) |

## Setup / tests

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest -q
```

## Run API

```bash
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Auth: required header `X-Tenant-ID: <uuid>` (invalid UUID → **400**).
