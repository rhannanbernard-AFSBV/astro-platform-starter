# OmniClean API

Node.js (Express) backend for OmniClean AI Scanner.

- GPT-4o vision extracts **spatial data only**
- All bidding math uses **Decimal.js** (ISSA hours, labor burden, 2.5% consumables, margin, SXM 5% TOT, dual USD/XCG)
- Multi-tenant via `X-Tenant-Id` on every request
- Embedded **PGlite** by default (no Docker); optional PostgreSQL via `DATABASE_URL`

## Quick start

```bash
cd apps/api
cp .env.example .env
npm install
npm run setup   # migrate + seed (optional; boot also auto-migrates)
npm run dev     # http://localhost:4000
```

## Demo scan (no OpenAI key)

```bash
curl -s -X POST http://localhost:4000/api/scan \
  -H "X-Tenant-Id: 1" \
  -F "client_name=Philipsburg Medical Plaza" \
  -F "property_address=1 Front Street, Philipsburg" \
  -F "frequency=5x / week" \
  -F "mock=1" | jq .
```

With an image + `OPENAI_API_KEY`, omit `mock=1` and attach `-F image=@floorplan.jpg`.
