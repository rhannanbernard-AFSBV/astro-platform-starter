# Staff support runbook — Authentic Jamaican (Philipsburg)

One-page ops for floor, bar, and kitchen.

## Open

1. Open SPA with `PUBLIC_POS_API_URL` set (never demo mode for live service).
2. Sign in → rotate demo PIN if prompted.
3. Sales → **Open shift**.
4. Confirm station: Service / Kitchen / Bar (`?station=`).

## Guest QR orders

1. Print table tents: `/order/qr` → pick table → Print.
2. Guest scans → order lands as open check + kitchen/bar ticket.
3. Advance tickets on Kitchen/Bar boards.
4. Take payment on Service (USD or XCG) — tip from guest app is already on the check.

## 86 / happy hour

- Menu admin or Kitchen board: toggle 86.
- Happy hour pours follow admin windows (local time).

## Reprint / mistakes

- Browser print for kitchen/bar tickets.
- Bar: **Reopen last tab** if closed by mistake.
- Manager void only for bad sales (audit logged).

## Close

1. Manager PIN → Sales → review Floor vs Bar day-part.
2. **Close shift**.
3. **Backup DB** (Sales or `scripts/backup-pos.sh`).

## Escalate

| Issue | First action |
|-------|----------------|
| API down | Check Docker / API health; do not switch tablets to demo mid-service |
| Guest order missing | Confirm `PUBLIC_POS_API_URL` on guest site; refresh Kitchen |
| Wrong prices | Menu admin → Meals/Bar; guest menu refreshes from POS |
| PIN lockout | Wait lockout window or manager unlock path |

Philipsburg tip: keep laminated QR on every Front Street table; cruise guests should see USD & XCG on the phone before they order.
