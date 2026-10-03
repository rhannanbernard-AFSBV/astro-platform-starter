# Allyanna production deployment

Compose stack: **nginx** (TLS + `X-Tenant-ID` passthrough) → **frontend** (Next.js `:3000`) + **backend** (FastAPI `:8000`) + **postgres** (internal only, persistent volume).

## Layout

| Path | Role |
|------|------|
| `backend/Dockerfile` | Multi-stage Python slim FastAPI image (non-root, `:8000`) |
| `frontend/Dockerfile` | Multi-stage Next.js build (non-root, `:3000`) |
| `docker-compose.prod.yml` | Production wiring + restart policies |
| `deploy/nginx/nginx.conf` | SSL termination + tenant header passthrough |
| `.env.production.example` | Secret/runtime template → copy to `.env.production` |

Requires application sources under `backend/` and `frontend/` (Allyanna FastAPI + Next.js shells).

## Quick start

```bash
cp .env.production.example .env.production
# edit secrets: POSTGRES_PASSWORD, ALLYANNA_APP_PASSWORD,
# ALLYANNA_DATABASE_URL, OPENAI_API_KEY, JWT_SECRET, NEXT_PUBLIC_API_BASE_URL

# TLS (replace with real certs in production)
openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
  -keyout deploy/nginx/ssl/privkey.pem \
  -out deploy/nginx/ssl/fullchain.pem \
  -subj "/CN=localhost"

docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Apply DB migrations (Pillar 1 RLS / tax tables) against the postgres service before serving traffic — see `backend/migrations/README.md`. Use `DATABASE_URL` + `ALLYANNA_APP_PASSWORD` from `.env.production`.

## Hard constraints (runtime)

- LLM (`OPENAI_API_KEY`) is extract/route/OCR only — financial math stays in Python `decimal`.
- App DB role uses RLS; every query is tenant-scoped via `X-Tenant-ID` → `app.current_tenant_id`.
- Tax rates load by `tax_year` + `country_code` (`SXM`), not hardcoded formula literals.
- Secrets exist only in `.env.production` / orchestrator env — never in images.
