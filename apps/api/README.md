# OmniClean API

Node.js (Express) backend for OmniClean AI Scanner.

- JWT auth — `tenant_id` from Bearer token (not spoofable headers)
- GPT-4o vision extracts **spatial data only**
- Bidding math uses **Decimal.js**
- E-sign via tokenized `/p/:token` page + JSON API
- Outbound email: Resend → SendGrid → SMTP → dry_run
- Embedded **PGlite** by default; optional PostgreSQL via `DATABASE_URL`

## Quick start

```bash
cd apps/api
cp .env.example .env
npm install
npm run dev     # http://localhost:4000
```

Demo login: `demo@omniclean.demo` / `demo1234`

## Smoke test

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@omniclean.demo","password":"demo1234"}' | jq -r .token)

curl -s -X POST http://localhost:4000/api/scan \
  -H "Authorization: Bearer $TOKEN" \
  -F "client_name=Philipsburg Medical Plaza" \
  -F "mock=1" | jq .
```

Env vars: see `.env.example`. Auth / email / e-sign exercise steps are in the Project docs (`omniclean-build.md`).
