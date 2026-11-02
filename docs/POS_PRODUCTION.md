# Authentic Jamaican Cuisine & Bar POS — production readiness

**Shippable tip:** branch `cursor/pos-p0-p2-improvements-642e` (full floor tip: staff desk, rush, guest loop, menu photos, **plus** P0–P2 hardening — ESC/POS print, conflict rebase, SSE boards, production boot guard, guest card intent).

Older draft PRs for intermediate POS slices are **superseded** by this tip for pilot deploy.

## What this stack delivers

| Capability | Status |
|------------|--------|
| Server as source of truth | ✅ FastAPI + SQLite (`backend/`) |
| Hashed PINs + sessions | ✅ PBKDF2; pins never returned |
| Forced demo PIN rotation | ✅ `POS_FORCE_PIN_CHANGE` (on in Docker) |
| PIN rate limit / lockout | ✅ Per IP + tenant (`POS_PIN_*`) |
| Session idle revoke | ✅ Server `POS_SESSION_IDLE_MINUTES` |
| Station idle lock UI | ✅ Menu setting `idleLockMinutes` |
| Multi-device sync | ✅ Poll + optimistic revision + **409 rebase** |
| Realtime board nudge | ✅ SSE `/pos/events` (plus 2s poll) |
| Kitchen/bar print | ✅ ESC/POS Web Serial + browser fallback; auto-print on fire |
| Production boot guard | ✅ Blocks live builds without `PUBLIC_POS_API_URL` |
| Immutable sales ledger | ✅ Insert + manager/admin void |
| Audit ledger | ✅ Server-backed |
| Owner backup + ops summary | ✅ `/pos/ops/*` + `scripts/backup-pos.sh` |
| Stripe card intents | ✅ Staff + **guest** optional (`STRIPE_SECRET_KEY`) |
| Docker Compose pilot | ✅ `docker-compose.yml` |
| Allyanna Postgres RLS SQL | ✅ `migrations/002` + bartender `003` |
| Local demo without API | ✅ Dev only (unset URL); blocked in production builds |
| Bar station + tabs / HH / comps / 86 | ✅ |
| Floor smoke path | ✅ `docs/POS_FLOOR_SMOKE.md` + `npm run test:smoke` |
| Shift day-part (floor vs bar) | ✅ Sales + close-shift confirm |
| Reopen last closed bar tab | ✅ |
| Staff desk oversight | ✅ Manager/admin per-staff tickets + payments |
| My open checks filter | ✅ Service sidebar for servers |
| Guest `/order` + QR | ✅ Phase B — menu, checkout, kitchen/bar tickets, status |
| Guest pay-at-counter | ✅ Always; in-app card intent when Stripe configured |

See also: `docs/GUEST_ORDER.md`.

## Pilot deploy (trusted customer path)

```bash
# 1) API with persistent volume
docker compose up -d --build

# 2) SPA — set API origin (Netlify env or local .env)
PUBLIC_POS_API_URL=https://your-api.example.com

# 3) Open the app, sign in with a seed PIN, immediately set a private PIN
# 4) Menu → Station idle lock (default 5 minutes)
# 5) Run docs/POS_FLOOR_SMOKE.md (or npm run test:smoke)
# 6) Sales → Backup DB after each close (or cron the script below)
```

### Nightly backup

```bash
# Local file copy
./scripts/backup-pos.sh

# Remote (manager PIN required)
POS_API_URL=https://your-api.example.com POS_MANAGER_PIN=**** ./scripts/backup-pos.sh --remote
```

### Tests

```bash
npm test          # vitest (includes floor smoke)
npm run test:smoke
npm run pos:test  # pytest API
npm run test:all
```

## Go-live checklist

1. **Deploy API** behind HTTPS with a persistent volume for `/data` (Compose volume `pos-data`).
2. **Set `PUBLIC_POS_API_URL`** on the SPA to the API origin; set `POS_CORS_ORIGINS` to the SPA origin.
3. **Rotate every staff PIN** (forced on first login when `POS_FORCE_PIN_CHANGE=1`).
4. **Confirm idle lock** on floor tablets (UI + server idle revoke).
5. **Run floor smoke** — `docs/POS_FLOOR_SMOKE.md`.
6. **Configure Stripe Terminal** (or keep cash / recorded card only until hardware is ready).
7. **Schedule backups** — `scripts/backup-pos.sh` or Sales → Backup DB.
8. **Apply Postgres migrations** when joining Allyanna compose (`001`, `002`, `003`).
9. **Kitchen printers** — Menu → pair Web Serial ESC/POS (or rely on browser print fallback). Keep **Auto-print on fire** enabled for expo tickets.

Without items 1–5, do not take real customer payments.
