#!/bin/sh
# Allyanna production DB migrate — wait for Postgres, apply SQL, optional demo seed.
# Secrets come only from the environment (DATABASE_URL, ALLYANNA_APP_PASSWORD).
set -eu

MIGRATIONS_DIR="${MIGRATIONS_DIR:-/migrations}"
SEED_DEMO_TENANT="${ALLYANNA_SEED_DEMO_TENANT:-true}"
# Frontend stub Master Account profile (PR #6 tenant switcher).
DEMO_TENANT_ID="${ALLYANNA_DEMO_TENANT_ID:-11111111-1111-1111-1111-111111111111}"
DEMO_TENANT_NAME="${ALLYANNA_DEMO_TENANT_NAME:-Allyanna Demo Business}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is required (migrator / superuser connection)." >&2
  exit 1
fi

if [ -z "${ALLYANNA_APP_PASSWORD:-}" ]; then
  echo "ERROR: ALLYANNA_APP_PASSWORD is required (sets allyanna_app_user password)." >&2
  exit 1
fi

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "ERROR: migrations directory not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

echo "Waiting for Postgres (DATABASE_URL host)..."
i=0
until psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "ERROR: Postgres not ready after ${i} attempts." >&2
    exit 1
  fi
  sleep 2
done
echo "Postgres is ready."

# Apply numbered SQL migrations in lexical order (idempotent IF NOT EXISTS / ON CONFLICT).
set -- "$MIGRATIONS_DIR"/*.sql
if [ ! -e "$1" ]; then
  echo "ERROR: no *.sql files under $MIGRATIONS_DIR" >&2
  exit 1
fi

for sql in "$MIGRATIONS_DIR"/*.sql; do
  echo "Applying $(basename "$sql")..."
  psql "$DATABASE_URL" \
    -v ON_ERROR_STOP=1 \
    -v app_password="$ALLYANNA_APP_PASSWORD" \
    -f "$sql"
done

if [ "$SEED_DEMO_TENANT" = "true" ] || [ "$SEED_DEMO_TENANT" = "1" ]; then
  echo "Seeding demo tenant ${DEMO_TENANT_ID} (idempotent)..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
    -v demo_tenant_id="$DEMO_TENANT_ID" \
    -v demo_tenant_name="$DEMO_TENANT_NAME" \
    <<'SQL'
INSERT INTO tenants (id, company_name, country_code)
VALUES (:'demo_tenant_id', :'demo_tenant_name', 'SXM')
ON CONFLICT (id) DO NOTHING;
SQL
fi

echo "Allyanna migrations complete."
