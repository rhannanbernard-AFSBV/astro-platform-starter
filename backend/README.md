# Allyanna accounting API

Multi-tenant foundation for Sint Maarten tax calculations. The Astro app at the repository root is the existing Netlify starter and is separate from this service.

## What this slice covers

- Master accounts (accounting firms) and the business profiles under them
- A signed-in user can switch the active business profile, and Postgres row-level security keeps that switch inside the firm
- Turnover tax, annual wage-tax step brackets, and SZV ZV/OV plus AOV/AWW splits and monthly wage ceilings
- Rates, brackets, and ceilings are rows for `country_code = SXM` and a `tax_year`. The Python functions only multiply and cap the decimals they are given
- Async FastAPI routes with Pydantic responses. Money is a decimal string
- Invoice headers and line items for the active business profile. Subtotal is the sum of the lines. Turnover tax is the existing TOT calculation against that subtotal
- Asynchronous receipt and invoice intake. GPT-4o copies the printed fields. Python recomputes line totals and turnover tax from the tax tables
- A turnover-tax worksheet that sums posted invoice subtotals and turnover tax for a period. The rate is read from the tax table
- A filed turnover-tax return that stores that period's summed subtotal, table rate, and summed tax for the active business profile

Payroll runs are not in this service yet.

## Run locally

PostgreSQL 16, then:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
./scripts/apply_schema.sh allyanna
export DATABASE_URL=postgresql://allyanna_app:allyanna_app_dev@127.0.0.1:5432/allyanna
export OPENAI_API_KEY=sk-your-key
export OPENAI_MODEL=gpt-4o
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

## Invoices

`POST /api/v1/invoices` records a vendor invoice on the active business profile. Send the vendor, dates, and lines (`description`, `quantity`, `unit_price`) as decimal strings. The service prices the lines, then calls the TOT calculation for `tax_year` and `country_code`. `GET /api/v1/invoices` and `GET /api/v1/invoices/{invoice_id}` return only that profile's documents.

`POST /api/v1/documents/{document_id}/invoice` posts a completed intake into that ledger. The vendor, invoice date, subtotal, turnover tax, and grand total are the recomputed intake amounts. Python prices the stored lines again and reads turnover tax from the tax table. The printed model amounts are not used. One intake can be posted once.

## Turnover-tax worksheet

`POST /api/v1/tax/tot/worksheet` sums the active business profile's posted invoices for `period_start` through `period_end`. Both dates must fall in `tax_year`. Subtotal and turnover tax are the sums of the posted invoice amounts, added with `decimal.Decimal`. The rate on the worksheet is loaded from the Sint Maarten turnover-tax table for that year. The query is limited to the active profile's `tenant_id`, and row-level security on `invoices` is the backstop. Another firm's worksheet for the same dates does not include these invoices.

`POST /api/v1/tax/tot/returns` files that worksheet. The stored row keeps the summed subtotal, the turnover-tax table rate at filing time, and the summed tax. `GET /api/v1/tax/tot/returns` and `GET /api/v1/tax/tot/returns/{return_id}` read it back for the active business profile. A period can be filed once. Row-level security on `tot_returns` keeps another firm from reading the filing.

## Document intake

Receipt and invoice capture is queued, then finished off the request. The upload is stored for the active business profile. Row-level security stays on `document_intakes` and `document_intake_lines`.

- `POST /api/v1/documents` — multipart field `file`. JPEG, PNG, WEBP, or PDF, up to 8 MB. Returns 202 with status `queued`
- `GET /api/v1/documents` and `GET /api/v1/documents/{document_id}` — the intake, including recomputed amounts once processing finishes

GPT-4o is asked to copy `vendor_name`, `invoice_date`, `subtotal`, `tot_amount`, `grand_total`, and the line items as decimal strings. The instructions tell it not to calculate tax, totals, percentages, or line amounts. `OPENAI_API_KEY` is read from the environment. `OPENAI_MODEL` defaults to `gpt-4o`.

Python validates that payload, prices each line as quantity times unit price with `decimal.Decimal`, and sums those rounded line totals. Turnover tax is the existing tax service applied to that subtotal for the invoice year and the business country. The rate comes from the tax table. The stored subtotal, TOT amount, and grand total are those recomputed figures. Printed amounts are stored beside them and compared. A later profile switch does not move a job that was already accepted.

## Tests

```bash
cd backend
source .venv/bin/activate
pytest
```

Integration tests create `allyanna_test` and connect as `allyanna_app`, which is not a superuser and does not bypass row-level security.
