# Dual-firm staging soak / isolation checks

Use a **staging** environment (not production). Prefer `ALLYANNA_SEED_DEMO=true` once to load Harbour Ledger vs Other Office, or create two real master accounts with distinct Bearer keys.

## Preconditions

- Tip schema migrated (`backend/scripts/migrate_prod.sh` or local `apply_schema.sh`)
- 2026 seed verified (`deploy/verify-sxm-2026.sql`)
- Staging `CORS_ORIGINS` locked to the staging desk origin
- Real `OPENAI_API_KEY` for OCR path (or skip OCR steps and post invoices via API)

## Isolation smoke

With keys `FIRM_A` and `FIRM_B`:

```bash
# Each firm sees only its tenants
curl -sS -H "Authorization: Bearer $FIRM_A" "$API/api/v1/context" | jq '.available_tenants'
curl -sS -H "Authorization: Bearer $FIRM_B" "$API/api/v1/context" | jq '.available_tenants'

# Firm A cannot switch into Firm B tenant
curl -sS -X POST -H "Authorization: Bearer $FIRM_A" -H "Content-Type: application/json" \
  -d "{\"tenant_id\":\"$FIRM_B_TENANT\"}" "$API/api/v1/context/switch"
# expect 403
```

## Compliance path soak (per firm)

1. Switch active business profile  
2. `POST /api/v1/documents` sample receipt → wait for extraction  
3. Review → post invoice (`…/documents/{id}/invoice`)  
4. `GET /api/v1/tax/tot/period-ready`  
5. File unfiled period / pay open return via dues actions  
6. Confirm firm B never sees firm A invoices, returns, or balances  
7. Optional: annual summary / dues on year close path  

Repeat for firm B. Record dates, return IDs, and balances in the staging run log.

## Production cutover

Rebuild with `ALLYANNA_SEED_DEMO=false`, issue new API keys, revoke any staging demo hashes, and keep payroll out of the TOT desk (API-only / deferred product).
