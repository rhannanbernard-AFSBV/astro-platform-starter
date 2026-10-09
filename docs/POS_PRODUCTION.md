# Savory POS — production readiness

## What this branch delivers

| Capability | Status |
|------------|--------|
| Server as source of truth | ✅ FastAPI + SQLite (`backend/`) |
| Hashed PINs + sessions | ✅ PBKDF2; pins never returned |
| Multi-device sync | ✅ Poll + optimistic revision |
| Immutable sales ledger | ✅ Insert + manager void only |
| Audit ledger | ✅ Server-backed |
| Stripe card intents | ✅ Optional (`STRIPE_SECRET_KEY`) |
| Allyanna Postgres RLS SQL | ✅ `migrations/002_pos_ledger.sql` |
| Local demo without API | ✅ Unset `PUBLIC_POS_API_URL` |

## Go-live checklist (still required)

1. **Change demo PINs** and rotate manager credentials before customer traffic.
2. **Deploy API** behind HTTPS (Docker/Fly/Render) with persistent volume for `POS_DATA_DIR` or Postgres.
3. **Set `PUBLIC_POS_API_URL`** on the SPA deploy to the API origin.
4. **Configure Stripe** (or another processor) + Terminal hardware for in-person cards; until then treat “card” as recorded tender only.
5. **Kitchen/receipt printers** — integrate ESC-POS or vendor cloud print (not in this PR).
6. **Apply Postgres migrations** when joining Allyanna compose (`001` then `002`).
7. **Backups** — nightly dump of SQLite/Postgres + sales CSV export policy.
8. **Session lock / idle timeout** UI polish; rate-limit PIN attempts at the reverse proxy.
9. **E2E tests** against API + SPA in CI.

Without items 1–4, do not take real customer payments.
