# Allyanna Accounting Backend (SXM)

Integrated FastAPI package for Sint Maarten multi-tenant compliance:

- **Tax engine** — Decimal-only TOT / wage tax / SZV (no LLM math)
- **Pillar 2 tax tables** — JSON cache + Postgres `tax_rates` / `wage_tax_brackets`
- **RLS schema** — env password, `FORCE RLS`, `WITH CHECK`
- **Async tenant DB session** — `SET LOCAL app.current_tenant_id` + `X-Tenant-ID`
- **Compliance chat** — GPT-4o routes to local tools
- **OCR extract** — async field extraction (no recalculation)
- **Invoice persist** — OCR result → `invoices` under RLS
- **Monthly payroll run** — Decimal math + tenant-scoped INSERT

## Layout

```
backend/
  app/
    main.py              # FastAPI entrypoint
    tax_engine.py        # Decimal math
    tax_tables.py        # JSON + DB loaders (tax_year + country_code)
    db.py / db_tenant.py # async tenant session + GUC helper
    deps.py              # X-Tenant-ID / Bearer stub
    chat.py / ocr.py
    routes/              # compliance, tenant, payroll, invoices
  data/sxm_tax_tables_2026.json
  migrations/001_multi_tenant_rls.sql
  docker-compose.yml
  .env.example
  tests/
```

## Quick start (API + tests without Postgres)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest -q
uvicorn app.main:app --reload --port 8000
```

Health: `GET http://localhost:8000/health`

## Local Postgres

```bash
cd backend
cp .env.example .env
docker compose up -d

# wait until healthy, then migrate
export DATABASE_URL='postgresql://postgres:postgres@localhost:5432/allyanna'
export ALLYANNA_APP_PASSWORD='change-me-strong-secret'
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v app_password="$ALLYANNA_APP_PASSWORD" \
  -f migrations/001_multi_tenant_rls.sql
```

Point the API at the app role:

```bash
export ALLYANNA_DATABASE_URL='postgresql://allyanna_app_user:change-me-strong-secret@localhost:5432/allyanna'
uvicorn app.main:app --reload --port 8000
```

Full migration notes: [`migrations/README.md`](./migrations/README.md).

## Auth headers

| Route class | Headers |
|-------------|---------|
| Chat / OCR extract | `Authorization: Bearer demo-tenant-token` **or** `X-Tenant-ID` + `X-User-Id` |
| Payroll / invoices / tenant session | Required `X-Tenant-ID` (UUID; invalid → **400**) |

Optional live OpenAI: set `OPENAI_API_KEY`.

## Key routes

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/health` | Liveness |
| `POST` | `/api/v1/chat/compliance` | Tool-routed tax/payroll chat |
| `POST` | `/api/v1/ocr/receipts` | Async OCR extract |
| `POST` | `/api/v1/invoices/persist` | Persist OCR fields → `invoices` |
| `POST` | `/api/v1/payroll/process-monthly-run` | Wage/SZV + INSERT |
| `GET` | `/api/v1/tenant/session` | RLS GUC probe |

## Tests

```bash
cd backend
source .venv/bin/activate
pytest -q
```

Unit tests cover tax math and route validation with a **mocked DB** (no live Postgres required).

## Rules enforced

1. All money math uses `decimal.Decimal` — never `float`
2. LLM never calculates taxes; only extracts / routes
3. Every ledger query runs under tenant RLS GUC
4. Tax rates come from tables/JSON keyed by `tax_year` + `country_code=SXM`
5. Explicit Pydantic response models on every route
