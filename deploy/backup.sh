#!/usr/bin/env bash
# Logical backup of Allyanna Postgres. Supply connection via DATABASE_URL or flags.
set -euo pipefail

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${ALLYANNA_BACKUP_DIR:-./backups}"
mkdir -p "$OUT_DIR"
OUT_FILE="${OUT_DIR}/allyanna-${STAMP}.dump"

if [[ -n "${DATABASE_URL:-}" ]]; then
  pg_dump --format=custom --no-owner --no-acl --dbname="$DATABASE_URL" --file="$OUT_FILE"
else
  : "${PGHOST:?set DATABASE_URL or PGHOST}"
  : "${PGUSER:?set PGUSER}"
  : "${PGDATABASE:?set PGDATABASE}"
  pg_dump --format=custom --no-owner --no-acl --file="$OUT_FILE"
fi

echo "Wrote ${OUT_FILE}"
echo "Restore example: pg_restore --clean --if-exists --no-owner --dbname=\"\$DATABASE_URL\" ${OUT_FILE}"
