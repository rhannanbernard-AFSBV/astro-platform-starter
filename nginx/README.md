# Allyanna nginx gateway

Root-level gateway for the production compose stack (Frankie’s deploy layout).

```
allyanna-accounting/
├── backend/Dockerfile
├── frontend/Dockerfile
├── nginx/nginx.conf
└── docker-compose.prod.yml
```

| Path | Role |
|------|------|
| `nginx/nginx.conf` | SSL termination + `X-Tenant-ID` passthrough (no rewrite) |
| `nginx/Dockerfile` | Alpine nginx image used by compose |
| `nginx/ssl/` | Runtime cert mount (see `ssl/README.md`; keys not committed) |

Cursor rules already live under `.cursor/rules/` — no root `.cursorrules` duplicate.

## Quick start

```bash
cp .env.production.example .env.production
# fill secrets…

openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
  -keyout nginx/ssl/privkey.pem \
  -out nginx/ssl/fullchain.pem \
  -subj "/CN=localhost"

docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Bring-up runs the one-shot `migrate` service (`backend/scripts/migrate.sh` + `backend/migrations/*.sql`) after Postgres is healthy and before the FastAPI backend starts.
