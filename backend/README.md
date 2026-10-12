# Allyanna accounting API

Multi-tenant foundation for Sint Maarten tax calculations. The Astro app at the repository root is the existing Netlify starter and is separate from this service.

## What this slice covers

- Master accounts (accounting firms) and the business profiles under them
- A signed-in user can switch the active business profile, and Postgres row-level security keeps that switch inside the firm
- Turnover tax, annual wage-tax step brackets, and SZV ZV/OV plus AOV/AWW splits and monthly wage ceilings
- Rates, brackets, and ceilings are rows for `country_code = SXM` and a `tax_year`. The Python functions only multiply and cap the decimals they are given
- Async FastAPI routes with Pydantic responses. Money is a decimal string

Invoices, payroll runs, and OCR intake are not in this slice.

## Run locally

PostgreSQL 16, then:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
./scripts/apply_schema.sh allyanna
export DATABASE_URL=postgresql://allyanna_app:allyanna_app_dev@127.0.0.1:5432/allyanna
uvicorn allyanna.main:app --reload
```

`allyanna_app_dev` and the demo API keys are local defaults. Replace the role password before a shared deployment.

Demo keys after the seed:

- `allyanna-dev-key` — Harbour Ledger & Co., with Great Bay Provisions and Simpson Bay Charters
- `allyanna-other-key` — a second firm, used to prove that firm cannot see the first

```bash
curl -H "Authorization: Bearer allyanna-dev-key" http://127.0.0.1:8000/api/v1/context
```

Switch with `POST /api/v1/context/switch` and `{"tenant_id": "..."}` before calling the tax routes.

## Tax routes

All three require an active business profile. Amounts are decimal strings, not JSON floats.

- `POST /api/v1/tax/tot` — `gross_taxable_revenue`. Turnover tax is `revenue * rate` using the TOT row
- `POST /api/v1/tax/wage` — annual taxable wage (grondslag) for the AB 2026 schijventarief. The monthly loonbelasting lookup tables are not loaded yet
- `POST /api/v1/tax/szv` — monthly gross wage. Each component caps the wage at its own monthly ceiling. OV uses the request rate, otherwise the business profile rate, otherwise the statutory minimum stored on the component. The rate must sit inside the band stored on that row
- `GET /api/v1/tax/schedules?tax_year=2026&country_code=SXM` — the rows the calculators will read

The 2026 seed cites the statutory turnover-tax rate, AB 2026 no. 11, and the SZV AOV/AWW notice plus the published premium splits. The ZV/OV monthly ceiling is the Cg 10,000.00 maximum in force from 1 August 2022; SZV's public index did not show a later amendment. Confirm those rows before filing.

## Tests

```bash
cd backend
source .venv/bin/activate
pytest
```

Integration tests create `allyanna_test` and connect as `allyanna_app`, which is not a superuser and does not bypass row-level security.
