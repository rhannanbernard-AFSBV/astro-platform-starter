# Savory POS — production readiness

## What this stack delivers

| Capability | Status |
|------------|--------|
| Server as source of truth | ✅ FastAPI + SQLite (`backend/`) |
| Hashed PINs + sessions | ✅ PBKDF2; pins never returned |
| Forced demo PIN rotation | ✅ `POS_FORCE_PIN_CHANGE` (on in Docker) |
| PIN rate limit / lockout | ✅ Per IP + tenant (`POS_PIN_*`) |
| Session idle revoke | ✅ Server `POS_SESSION_IDLE_MINUTES` |
| Station idle lock UI | ✅ Menu setting `idleLockMinutes` |
| Multi-device sync | ✅ Poll + optimistic revision |
| Immutable sales ledger | ✅ Insert + manager void only |
| Audit ledger | ✅ Server-backed |
| Owner backup + ops summary | ✅ `/pos/ops/*` + `scripts/backup-pos.sh` |
| Stripe card intents | ✅ Optional (`STRIPE_SECRET_KEY`) |
| Docker Compose pilot | ✅ `docker-compose.yml` |
| Allyanna Postgres RLS SQL | ✅ `migrations/002_pos_ledger.sql` |
| Local demo without API | ✅ Unset `PUBLIC_POS_API_URL` |

## Pilot deploy (trusted customer path)

```bash
# 1) API with persistent volume
docker compose up -d --build

# 2) SPA — set API origin (Netlify env or local .env)
PUBLIC_POS_API_URL=https://your-api.example.com

# 3) Open the app, sign in with a seed PIN, immediately set a private PIN
# 4) Menu → Station idle lock (default 5 minutes)
# 5) Sales → Backup DB after each close (or cron the script below)
```

### Nightly backup

```bash
# Local file copy
./scripts/backup-pos.sh

# Remote (manager PIN required)
POS_API_URL=https://your-api.example.com POS_MANAGER_PIN=**** ./scripts/backup-pos.sh --remote
```

## Go-live checklist

1. **Deploy API** behind HTTPS with a persistent volume for `/data` (Compose volume `pos-data`).
2. **Set `PUBLIC_POS_API_URL`** on the SPA to the API origin; set `POS_CORS_ORIGINS` to the SPA origin.
3. **Rotate every staff PIN** (forced on first login when `POS_FORCE_PIN_CHANGE=1`).
4. **Confirm idle lock** on floor tablets (UI + server idle revoke).
5. **Configure Stripe Terminal** (or keep cash / recorded card only until hardware is ready).
6. **Schedule backups** — `scripts/backup-pos.sh` or Sales → Backup DB.
7. **Apply Postgres migrations** when joining Allyanna compose (`001` then `002`).
8. **Kitchen/receipt printers** — ESC-POS or vendor cloud print (still outstanding).
9. **E2E tests** against API + SPA in CI (unit/API coverage is in place).

Without items 1–4, do not take real customer payments.
