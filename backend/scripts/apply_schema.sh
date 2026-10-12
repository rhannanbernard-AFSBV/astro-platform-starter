#!/usr/bin/env bash
# Apply the foundation schema and SXM 2026 seed to a local Postgres database.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_NAME="${1:-allyanna}"

if [[ ! "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "database name must contain only letters, digits, and underscores" >&2
  exit 1
fi

PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1)
if ! "${PSQL[@]}" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1; then
  "${PSQL[@]}" -d postgres -c "CREATE DATABASE ${DB_NAME}"
fi
"${PSQL[@]}" -d "$DB_NAME" -f "$ROOT/db/000_role.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$ROOT/db/migrations/001_foundation.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$ROOT/db/seeds/001_sxm_2026.sql"
"${PSQL[@]}" -d "$DB_NAME" -f "$ROOT/db/migrations/002_invoices.sql"
echo "Applied Allyanna schema to ${DB_NAME}"
