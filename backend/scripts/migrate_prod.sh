#!/usr/bin/env bash
# Apply tip schema from backend/db/ for Docker/production.
# Requires: DATABASE_URL (superuser or owner), ALLYANNA_APP_PASSWORD
# Optional: ALLYANNA_SEED_DEMO=true to load local dual-firm demo keys (never for live).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${DATABASE_URL:?set DATABASE_URL}"
: "${ALLYANNA_APP_PASSWORD:?set ALLYANNA_APP_PASSWORD}"

SEED_DEMO="${ALLYANNA_SEED_DEMO:-false}"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1)

echo "Ensuring allyanna_app role…"
"${PSQL[@]}" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'allyanna_app') THEN
    EXECUTE format('CREATE ROLE allyanna_app LOGIN PASSWORD %L', '${ALLYANNA_APP_PASSWORD}');
  ELSE
    EXECUTE format('ALTER ROLE allyanna_app WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD %L', '${ALLYANNA_APP_PASSWORD}');
  END IF;
END
\$\$;
SQL

apply() {
  local file="$1"
  echo "Applying ${file}"
  "${PSQL[@]}" -f "$ROOT/$file"
}

apply "db/migrations/001_foundation.sql"
apply "db/seeds/001_sxm_2026.sql"
if [[ "$SEED_DEMO" == "true" || "$SEED_DEMO" == "1" ]]; then
  echo "WARNING: seeding demo firms and known Bearer keys (not for live)"
  apply "db/seeds/001b_local_demo_firms.sql"
else
  echo "Skipping demo firm/API-key seed (ALLYANNA_SEED_DEMO=${SEED_DEMO})"
fi
apply "db/migrations/002_invoices.sql"
apply "db/migrations/003_payroll.sql"
apply "db/seeds/002_sxm_2026_monthly_wage_tax.sql"
apply "db/migrations/004_document_intakes.sql"
apply "db/migrations/005_post_intake.sql"
apply "db/migrations/006_tot_returns.sql"
apply "db/migrations/007_tot_return_payments.sql"
apply "db/migrations/008_filed_period.sql"
apply "db/migrations/009_return_due_date.sql"
apply "db/migrations/010_tot_return_amendments.sql"
apply "db/migrations/011_correcting_invoice.sql"
apply "db/migrations/012_tot_return_refunds.sql"
apply "db/migrations/013_tot_annual_summary.sql"
apply "db/migrations/014_tot_annual_summary_amendments.sql"

echo "Tip schema migrate complete"
