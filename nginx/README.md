# Allyanna nginx gateway

Tip-aligned TLS reverse proxy for the FastAPI API (`/api/`) and Next.js desk (`/`).

This stack replaces the obsolete deploy track on PR #8 (old `backend/migrations` + `X-Tenant-ID` era). Use `docker-compose.prod.yml` at the repo root with secrets from `.env.production` (copied from `.env.production.example`).
