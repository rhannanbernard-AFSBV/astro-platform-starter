# Allyanna go-live checklist (tip-aligned)

**Status:** hardening in progress — **not live-ready** until Frankie supplies real secrets and staging soak passes.

**Canonical API tip:** `main` after PR #63 / #64. **Do not** merge obsolete PR #8 deploy suite.

## Scope decision (payroll vs TOT)

| Track | Live scope |
|-------|------------|
| **TOT / OCR / dues** | In scope for go-live desk path |
| **Payroll** | **Deferred** — API calculators + RLS exist; no desk UI; payroll never enters TOT worksheets (`test_source_guards.py`) |

Live wage filings are out of scope until a payroll UI + ops story ships. Isolation from TOT remains enforced.

## Required secrets (user-supplied)

Copy `.env.production.example` → `.env.production` and fill:

| Variable | Purpose |
|----------|---------|
| `POSTGRES_PASSWORD` / `DATABASE_URL` | Postgres bootstrap |
| `ALLYANNA_APP_PASSWORD` / `ALLYANNA_DATABASE_URL` | App role for FastAPI |
| `OPENAI_API_KEY` | GPT-4o OCR extraction (math stays in Python) |
| `CORS_ORIGINS` | Exact HTTPS desk origin(s) |
| `NEXT_PUBLIC_API_BASE_URL` | Browser API base (usually same HTTPS origin) |

Issue real Bearer API keys into `allyanna.api_keys` (SHA-256 hashes). Never use `allyanna-dev-key` / `allyanna-other-key` in production — the API rejects them when `ALLYANNA_ENV=production`.

## Tip-aligned deploy

```bash
cp .env.production.example .env.production
# edit secrets; place TLS at nginx/ssl/{fullchain,privkey}.pem
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Health: `GET /api/v1/health` via the TLS gateway.

Backups: `deploy/backup.sh`. Monitoring notes: `deploy/monitoring.md`.

## Verify 2026 SXM tax seed

After migrate (`ALLYANNA_SEED_DEMO=false` still loads tax rows):

```bash
psql "$ALLYANNA_DATABASE_URL" -f deploy/verify-sxm-2026.sql
```

Expect TOT / WAGE_TAX / SZV / WAGE_TAX_MONTHLY schedules for `tax_year=2026`, `country_code=SXM`. Confirm printed rates against Tax Inspectorate / SZV notices before any live filing.

## Dual-firm staging soak

See `deploy/dual-firm-soak.md`. Run on staging with `ALLYANNA_SEED_DEMO=true` (or two real firms), prove RLS isolation, then rebuild production with `ALLYANNA_SEED_DEMO=false`.

## Stale PRs

Allyanna drafts **#2–#9** are superseded by the tip on `main` + this go-live PR. Do not merge #8.
