# Savory POS production API

Durable FastAPI backend for the restaurant POS:

- Hashed staff PINs (PBKDF2) — never returned to clients
- Session tokens
- SQLite store for local/dev (`backend/data/pos.db`)
- Immutable **sales ledger** (void-only, manager)
- Audit ledger
- Optimistic concurrency for multi-device floor/kitchen sync
- Optional **Stripe PaymentIntents** when `STRIPE_SECRET_KEY` is set
- Postgres RLS migration aligned with Allyanna (`migrations/002_pos_ledger.sql`)

## Quick start

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# For local demos without forced PIN rotation:
# echo POS_FORCE_PIN_CHANGE=0 >> .env
uvicorn app.main:app --reload --port 8000
```

Or from the repo root (persistent volume, production-like defaults):

```bash
docker compose up -d --build
```

Health: `GET http://localhost:8000/health`  
POS health: `GET http://localhost:8000/pos/health`

### Point the SPA at the API

In the Astro app root:

```bash
# .env
PUBLIC_POS_API_URL=http://localhost:8000
```

Then `npm run dev`. Staff must PIN-login against the API. Demo seed PINs:

| Role      | PIN  |
|-----------|------|
| Server    | 1234 |
| Kitchen   | 2222 |
| Bartender | 3333 |
| Admin     | 5555 |
| Manager   | 9999 |

**With `POS_FORCE_PIN_CHANGE=1` (Docker default) the UI blocks the floor until each user sets a private PIN.** Rate limits lock an IP after repeated failures; idle sessions revoke server-side and the SPA locks the station.

### Owner reliability

- `GET /pos/ops/summary` — open tables, sales totals, recent backups (manager/admin)
- `POST /pos/ops/backup` — checkpoint + copy SQLite under `POS_DATA_DIR/backups`
- `GET /pos/ops/backup/latest` — download newest backup
- `GET /pos/ops/sales.csv` — ledger CSV
- `./scripts/backup-pos.sh` — local or `--remote` cron helper

### Stripe (optional card rails)

```bash
export STRIPE_SECRET_KEY=sk_test_...
export PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

Without Stripe, cash and manual card amounts still record to the ledger.

### Tests

```bash
cd backend
pytest -q
```

### Postgres (production / Allyanna)

Apply Allyanna `001_multi_tenant_rls.sql`, then:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/002_pos_ledger.sql
```

The SQLite store is the default in this package; wire `DATABASE_URL` adapters when deploying beside Allyanna compose.

## Multi-device

Each station opens the SPA with `PUBLIC_POS_API_URL` set (and optional `?station=kitchen`). The client polls `/pos/state` every 2s and pushes edits with revision checks (`409` → reload).
