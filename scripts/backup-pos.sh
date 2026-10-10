#!/usr/bin/env bash
# Nightly / on-demand POS backup helper for owners.
# Usage:
#   ./scripts/backup-pos.sh                  # local data dir
#   POS_API_URL=https://pos.example.com \
#     POS_MANAGER_PIN=**** ./scripts/backup-pos.sh --remote
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_DATA="${POS_DATA_DIR:-$ROOT/backend/data}"
OUT_DIR="${POS_BACKUP_DIR:-$LOCAL_DATA/backups}"
mkdir -p "$OUT_DIR"

if [[ "${1:-}" == "--remote" ]]; then
  : "${POS_API_URL:?Set POS_API_URL}"
  : "${POS_MANAGER_PIN:?Set POS_MANAGER_PIN}"
  API="${POS_API_URL%/}"
  TOKEN="$(curl -fsS -X POST "$API/pos/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"pin\":\"$POS_MANAGER_PIN\"}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')"
  curl -fsS -X POST "$API/pos/ops/backup" -H "Authorization: Bearer $TOKEN" >/dev/null
  STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
  curl -fsS "$API/pos/ops/backup/latest" -H "Authorization: Bearer $TOKEN" \
    -o "$OUT_DIR/pos-remote-$STAMP.db"
  echo "Remote backup saved to $OUT_DIR/pos-remote-$STAMP.db"
  exit 0
fi

DB="$LOCAL_DATA/pos.db"
if [[ ! -f "$DB" ]]; then
  echo "No local DB at $DB" >&2
  exit 1
fi
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$OUT_DIR/pos-$STAMP.db"
cp -f "$DB" "$DEST"
# Keep last 14 local copies
ls -1t "$OUT_DIR"/pos-*.db 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "Local backup saved to $DEST"
