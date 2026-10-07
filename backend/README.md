# Allyanna Accounting Backend (SXM)

Integrated FastAPI package for Sint Maarten multi-tenant compliance:

- **Tax engine** — Decimal-only TOT / wage tax / SZV (no LLM math)
- **Pillar 2 tax tables** — JSON cache + DB `tax_rates` / `wage_tax_brackets` (Postgres or SQLite)
- **RLS schema (server)** — Postgres env password, `FORCE RLS`, `WITH CHECK`
- **SQLite desktop** — embedded DB at `%LOCALAPPDATA%\Allyanna\allyanna_ledger.db` (`local_invoices` / `local_payroll_records`) with app-enforced `tenant_id`
- **Async tenant DB session** — Postgres GUC or SQLite tenant bind + `X-Tenant-ID`
- **Compliance chat** — GPT-4o routes to local tools (offline keyword router when no key)
- **OCR extract** — async field extraction (optional local API key; no recalculation)
- **Invoice persist** — OCR result → `invoices` under tenant isolation
- **Monthly payroll run** — Decimal math + tenant-scoped INSERT

## Layout

```
backend/
  app/
    main.py              # FastAPI entrypoint (+ optional static UI)
    paths.py             # Windows AppData / resource roots
    local_ledger.py      # Frankie: get_local_db_connection + initialize_local_sxm_tables
    sqlite_db.py         # async tenant session over allyanna_ledger.db
    local_config.py      # AppData config.json / engine selection
    tax_engine.py        # Decimal math
    tax_tables.py        # JSON + DB loaders (tax_year + country_code)
    db.py / db_tenant.py # async tenant session (sqlite|postgres)
    deps.py              # X-Tenant-ID / Bearer stub
    chat.py / ocr.py
    routes/              # compliance, tenant, payroll, invoices
  data/sxm_tax_tables_2026.json
  migrations/001_multi_tenant_rls.sql
  migrations/sqlite/001_local_schema.sql
  allyanna-backend.spec  # PyInstaller → allyanna-backend.exe
  docker-compose.yml
  .env.example
  tests/
```

## Quick start (local SQLite — no Postgres / no cloud)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export ALLYANNA_LOCAL_MODE=1
export ALLYANNA_DB_ENGINE=sqlite
export ALLYANNA_DATA_DIR=/tmp/allyanna-local
pytest -q
python -m app   # or: uvicorn app.main:app --port 8000
```

Windows desktop packaging: see `desktop/README.md` and `backend/allyanna-backend.spec`.

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
