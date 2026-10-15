# Allyanna compliance desk

Thin Next.js client for the canonical Allyanna API tip. It walks OCR review →
post → period readiness → dues actions. **No tax math in the browser.**

## Run

```bash
# API (separate terminal)
cd backend
source .venv/bin/activate
export DATABASE_URL=postgresql://allyanna_app:allyanna_app_dev@127.0.0.1:5432/allyanna
uvicorn allyanna.main:app --reload

# UI
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open http://127.0.0.1:3000. Demo key after seed: `allyanna-dev-key`.

Load desk calls the API with that Bearer key, auto-switches to the first
business profile when none is active, then loads OCR review, period readiness,
and Tax Office dues. The API allows local CORS origins
`http://127.0.0.1:3000` and `http://localhost:3000` by default
(`CORS_ORIGINS`).

## Scope

- Bearer auth against `/api/v1/*`
- Context switch among business profiles
- Document review / post / upload
- Period readiness and dues payment / file-unfiled actions
- Payroll is intentionally not on this desk
