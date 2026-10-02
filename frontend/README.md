# Allyanna Accounting — Frontend

Next.js (App Router) TypeScript shell for the Allyanna Sint Maarten compliance API.

Astro at the repo root remains the marketing / Netlify starter site. This app lives under `frontend/` and talks to FastAPI over HTTP.

## Requirements

- Node.js 20+
- Allyanna FastAPI backend reachable at `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8000`)

## Setup

```bash
cd frontend
cp .env.example .env.local   # optional; defaults to http://localhost:8000
npm install
```

## Develop

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build / start

```bash
npm run build
npm start
```

## Environment

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | FastAPI origin (e.g. `http://localhost:8000`) |

## API contracts (client)

Shared client: `src/lib/api.ts` — **always** sends `X-Tenant-ID` (plus `X-User-Id` / `X-Role` for chat/OCR tenant context).

| Screen | Method / path | Body |
|--------|---------------|------|
| Compliance chat | `POST /api/v1/chat/compliance` | `{ user_prompt, tax_year? }` |
| Payroll monthly run | `POST /api/v1/payroll/process-monthly-run` | `{ employee_name, gross_salary, tax_year? }` |
| Invoice OCR | `POST /api/v1/ocr/receipts` | `{ file_url }` |

Money fields are treated as Decimal **strings**. The UI never computes tax, TOT, or SZV — it only displays backend results.

If OCR is not deployed yet, the upload panel keeps the same request shape and shows an accepted stub on 404 / network failure.

## Tenant switcher

Stub Master Account → business profiles in `src/lib/tenant-context.tsx`. Selecting a profile updates `X-Tenant-ID` for all subsequent calls (Pillar 3 white-label context switch).
