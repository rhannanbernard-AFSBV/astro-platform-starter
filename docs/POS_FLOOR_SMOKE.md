# POS floor smoke checklist

Shippable tip branch: **`cursor/pos-pilot-ship-642e`**

Automated mirror (no browser): `npm run test:smoke` → `src/components/bill/floorSmoke.test.ts`

Use this after deploy or before a live service. Prefer **local demo** (`PUBLIC_POS_API_URL` unset) first, then repeat with the API.

## Demo PINs (rotate before go-live)

| Role | PIN |
|------|-----|
| Server | 1234 |
| Kitchen | 2222 |
| Bartender | 3333 |
| Admin | 5555 |
| Manager | 9999 |

## Path A — Floor table (server tablet)

1. Open `/` (or `?station=service`). Unlock with **1234**.
2. Sales → **Open shift** (if closed).
3. Select **Table 12** (or open a new table).
4. Add **Jerk Chicken** (or any Main) + **Sorrel Punch** (or any Drink).
5. **Send food to kitchen** → confirm kitchen notification / Kitchen board ticket.
6. **Fire drinks now** (if not auto-fired) → confirm Bar rail ticket.
7. On Kitchen (`?station=kitchen`, PIN 2222): advance food queued → preparing → ready.
8. On Bar (`?station=bar`, PIN 3333): advance drink to ready/served.
9. Back on Service: **Guest bill** → tip → signature → preferred payment → approve.
10. **Take payment** (cash or card) in USD or XCG → status Paid.
11. Sales: row appears with dual totals; CSV export includes `station=floor`.

## Path B — Bar tab (bartender)

1. `?station=bar` or Service as bartender **3333**.
2. Floor map → **Open tab** with guest name (e.g. `Smoke Guest`).
3. Add a drink → fire to bar → bump served.
4. Guest bill → pay → **Close paid tab**.
5. Tap **Reopen last tab · {name}** → new open tab for same guest (mistake recovery).
6. Sales: bar check counted under **Bar checks** day-part.

## Path C — Shift close (manager)

1. Sign in **9999** → Sales.
2. Confirm **Station day-part** shows Floor vs Bar checks / tips / comps.
3. **Close shift** → confirm dialog lists floor + bar + cash/card.
4. Attempt Take payment on an open check → blocked until **Open shift**.
5. (Server mode) **Backup DB** after close.

## Pass criteria

- [ ] Food never appears on Bar rail; drinks never on Kitchen expo
- [ ] Guest must approve + choose payment before Take payment
- [ ] Dual USD · XCG shown on bill and payment
- [ ] Closed shift blocks payments
- [ ] Reopen last tab works after closing a paid/empty tab
- [ ] `npm run test:smoke` passes in CI / local

## Still out of scope

Stripe Terminal hardware, ESC-POS printers, Playwright browser CI (state-machine smoke covers the path until hardware printers land).
