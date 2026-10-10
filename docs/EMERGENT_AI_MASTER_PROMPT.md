# Emergent AI — Master Prompt: Restaurant Bill Generator (Authentic Jamaican Cuisine & Bar POS)

> **How to use:** Paste this entire document into Emergent AI as the project master prompt / system brief. It describes the **current production codebase** of the Restaurant Bill Generator POS (branch lineage culminating in pilot hardening + bar revenue + GPT-4o menu enrich + Meals/Bar admin split). **Leave nothing out** — treat every section as mandatory product truth unless you are explicitly asked to change a requirement.

---

## 0. YOUR MISSION

You are a principal full-stack engineer rebuilding or extending **“Restaurant Bill Generator”** — a multi-station restaurant POS / bill generator for **Authentic Jamaican Cuisine & Bar** in **Philipsburg, Sint Maarten (SXM)**.

Rebuild and extend this app **exactly** to the specification below. Do not invent Stripe Terminal hardware, ESC-POS printers, Allyanna payroll/TOT engines, or OCR intake as “already done.” Those are **out of scope** unless explicitly requested later.

**Non-negotiable laws (every feature must obey):**

1. **Zero-hallucination money math.** LLM (GPT-4o) never calculates taxes, totals, tips, FX, discounts, or percentages. All money uses **integer USD cents** in TypeScript (`math.ts`) and deterministic server payment helpers. Never use `float` for money.
2. **Dual operating modes:**
   - Local demo: `PUBLIC_POS_API_URL` unset → `localStorage` + plaintext demo PINs.
   - Server pilot: `PUBLIC_POS_API_URL` set → FastAPI + SQLite source of truth, hashed PINs, sessions, sales/audit ledgers.
3. **Food tickets ≠ drink tickets.** Kitchen expo vs Bar rail are separate boards with separate send paths.
4. **Preserve brand, theme, catalog counts, roles, and hardening flags** documented here.
5. Prefer the existing architecture (Astro + React SPA + FastAPI POS package) over greenfield rewrites unless asked.

---

## 1. PRODUCT IDENTITY

| Field | Value |
|---|---|
| UI / component name | Restaurant Bill Generator |
| Restaurant brand | **Authentic Jamaican Cuisine & Bar** |
| Tagline | **Country kitchen · market-fresh · coal pot fire** |
| Address | 14 Front Street, Philipsburg, Sint Maarten |
| Phone | +1 (721) 555-0142 |
| Tax ID | TAX-SXM-48291 |
| Feedback URL | https://savory.example/feedback |
| Jurisdiction | Sint Maarten (`country_code` / tenant seed: `SXM`) |
| Ledger currency | **USD** (integer cents) |
| Display / tender FX | **XCG** (Caribbean Guilder) at default **1.80 XCG = 1 USD** (configurable in settings) |
| Dual money format | `$12.34 · XCG 22.21` via `formatDual` |
| Legacy brand names (migrate away) | Savory Kitchen & Bar, SAVORY, Savory |
| API service names | `savory-pos` / Docker image `savory-pos-api:local` |
| Storage key | `savory-bill-generator-v6` |
| Session token key | `savory-pos-session-token` |
| BroadcastChannel | `savory-pos-sync-v1` |

**Visual theme (CSS):** Old-time Jamaican country market — wood, bush green, mango gold. Fonts: **Fraunces** (display) + **Manrope** (sans). Background uses wood texture `/textures/market-wood.svg` with warm board browns, bush green `#1c4d2c`, mango `#f0a202`, bonnet red `#d62828`. Avoid generic purple AI themes, cream/terracotta broadsheet, and flat single-color backgrounds. Brand name must be a hero-level signal in the topbar.

**Demo seed floor:** Tables **12 / 7 / 3**; Table 12 has demo queued Jerk Chicken + draft Sorrel Punch and demo notification / `ORD-DEMO-0001`.

---

## 2. TECH STACK

### Frontend
- **Astro 5** hybrid SSR with Netlify adapter
- **React 19** SPA island: `src/components/RestaurantBillGenerator.tsx` (~2300+ lines)
- Page: `src/pages/index.astro` mounts `<RestaurantBillGenerator client:load />` with `chrome={false}`
- Styles: `src/components/restaurant-bill-generator.css` (~3100+ lines) — custom POS sheet (not a card-dashboard template)
- Tests: **Vitest** (`npm test` / `vitest run`)
- Optional env: `PUBLIC_POS_API_URL`, `PUBLIC_STRIPE_PUBLISHABLE_KEY`
- Runtime override: `window.__POS_API_URL__`

### Backend (`backend/`)
- **Python 3.12 + FastAPI + uvicorn**
- **SQLite** under `POS_DATA_DIR` (default `backend/data/pos.db`; Docker `/data`)
- Pydantic v2 request/response models
- Optional **OpenAI GPT-4o** (`OPENAI_API_KEY`, optional `OPENAI_MENU_MODEL=gpt-4o`)
- Optional **Stripe PaymentIntents** (`STRIPE_SECRET_KEY`) — not Terminal hardware
- Postgres RLS-ready SQL: `backend/migrations/002_pos_ledger.sql` (Allyanna-aligned; runtime default remains SQLite)
- Tests: **pytest** (`npm run pos:test`)
- Docker: `docker-compose.yml` service `pos-api` port **8000**, volume `pos-data`

### Scripts / docs
- `scripts/backup-pos.sh` — local copy or `--remote` with manager PIN
- `docs/POS_PRODUCTION.md` — pilot checklist
- `backend/README.md` — API setup

### npm scripts (representative)
- `dev` / `start` → Astro
- `pos:api` → uvicorn on :8000
- `pos:test` → pytest
- `test` → vitest
- `test:all` → frontend + backend tests

---

## 3. DUAL MODE CONTRACT

| Mode | Trigger | Behavior |
|---|---|---|
| **Local demo** | `PUBLIC_POS_API_URL` empty/unset | `loadState`/`saveState` on `localStorage`; PIN match vs plaintext `staff[].pin`; `usePosSync` (BroadcastChannel + storage events); `useDebouncedSave` |
| **Server / pilot** | `PUBLIC_POS_API_URL` set (e.g. `http://localhost:8000`) | FastAPI snapshot is source of truth; Bearer session; hashed PINs; `usePosServer` poll ~2s + push ~500ms debounce; revision optimistic concurrency (HTTP 409 → reload); sales/audit ledgers |

If API is configured but unreachable, show: start the API or unset `PUBLIC_POS_API_URL` for local demo.

---

## 4. COMPLETE FILE MAP (IMPLEMENT THESE)

### SPA shell
- `src/pages/index.astro`
- `src/components/RestaurantBillGenerator.tsx` — root orchestrator (PIN gate, idle lock, tables/tabs, routing, voids/comps, AI enrich, guest bill, payment, dual-mode commit)
- `src/components/restaurant-bill-generator.css`

### `src/components/bill/*`
| File | Responsibility |
|---|---|
| `types.ts` | All domain types + constants |
| `defaults.ts` | STORAGE_KEY, restaurant, staff, food menu seed, tables, settings, bar tab factory |
| `beverageMenu.ts` | 25 mocktails, 8 wines, 5 champagnes, 7 rum/beer bottles, 25 cocktails |
| `storage.ts` | load/save, migrations v1→v6, staff helpers |
| `math.ts` | Cents math, FX, bill, payment, sales CSV |
| `roles.ts` | Role labels, views, every `can*` permission |
| `posLogic.ts` | Send food/drinks, bump/recall, course fire, audit helper, station deep-links |
| `statusUi.ts` | Kitchen status meta; beverage vs kitchen-bound category helpers |
| `menuAi.ts` | Local + remote enrich (copy only; no money) |
| `posApi.ts` | HTTP client for server mode |
| `usePosServer.ts` | Multi-device sync vs API |
| `usePosSync.ts` | Cross-tab LWW sync (local mode) |
| `useDebouncedSave.ts` | Debounced localStorage persist |
| `useIdleLock.ts` | Station UI idle lock |
| `useReadyAlerts.ts` | Ready-food alerts for servers |
| `PinGate.tsx` | PIN unlock UI |
| `ChangePinModal.tsx` | Forced / voluntary PIN change |
| `AdminPanel.tsx` | Meals vs Bar catalogs, settings, station links, audit log |
| `UsersPanel.tsx` | Staff CRUD |
| `ServiceMenu.tsx` | Floor menu grid + filters + intel expand |
| `OrderPanel.tsx` | Check lines, course fire, send food / fire drinks, comps |
| `TableMap.tsx` | Floor map + standup bar tabs |
| `KitchenBoard.tsx` | Shared board: `board="kitchen" \| "bar"` |
| `GuestBillModal.tsx` | Guest review, tip, signature, approve |
| `PaymentModal.tsx` | Cash/card/mixed, USD/XCG tender |
| `ReceiptView.tsx` | Guest / kitchen / paid receipts + share |
| `SalesReport.tsx` | Daily sales, shift, CSV, Backup DB |
| `NotificationCenter.tsx` | In-app notifications |
| `VoidReasonModal.tsx` | Void / comp reason picker |
| `ModifierModal.tsx` | Modifier selection on add |
| `StatusTabs.tsx` | Status filter chips |
| `Price.tsx` | Dual-currency price display |
| `Icons.tsx` | Icon set |
| `images.ts` | Image URL helpers |
| `*.test.ts` | vitest suites |

### Backend `backend/app/pos/*`
| File | Responsibility |
|---|---|
| `routes.py` | All `/pos/*` HTTP endpoints |
| `store.py` | SQLite schema, seed, auth, snapshot, sales, audit |
| `security.py` | PBKDF2 PIN hash, sessions, idle, force-PIN flags |
| `rate_limit.py` | Per IP+tenant PIN lockout |
| `payments.py` | Stripe PaymentIntent create/retrieve |
| `ops.py` | Owner summary, backup, sales CSV |
| `ai.py` | GPT-4o / local menu enrich |

Also: `backend/app/main.py`, `Dockerfile`, `requirements.txt`, `.env.example`, migrations, tests, `docker-compose.yml`, `scripts/backup-pos.sh`, `docs/POS_PRODUCTION.md`.

---

## 5. DOMAIN MODEL (types.ts — COMPLETE)

### Constants
```
MENU_CATEGORIES = ['Mains','Starters','Drinks','Wine','Champagne','Rum','Desserts']
MENU_CATEGORY_LABELS.Wine = 'Wine List'
BEVERAGE_CATEGORIES = ['Drinks','Wine','Champagne','Rum']
FOOD_CATEGORIES = ['Mains','Starters','Desserts']
MenuCatalogKind = 'meals' | 'bar'
TIP_AMOUNT_PRESETS = [0, 200, 500, 1000, 1500]  // USD cents, NOT percentages
TipAmountPreset = those | 'custom'
STAFF_ROLES = ['kitchen','bartender','server','admin','manager']
AppView = 'service' | 'kitchen' | 'bar' | 'reports' | 'admin' | 'users'
PaymentMethod = 'cash' | 'card' | 'mixed'
KitchenStatus = 'draft' | 'queued' | 'preparing' | 'ready' | 'served'
TableStatus = 'open' | 'paid' | 'partial'
CourseFire = 'hold' | 'fire' | 'all_day'
ReceiptTemplate = 'guest' | 'kitchen' | 'paid'
CheckKind = 'table' | 'bar_tab'
COMP_REASON_PRESETS = ['Spill / remake','VIP / host','Staff drink','Manager goodwill','Other']
VOID_REASON_PRESETS = ['Guest changed mind','Wrong item / modifier','86’d / out of stock','Duplicate ticket','Other']
```

### Core types (fields must exist)

**HappyHourWindow:** `priceCents`, `startHour` (inclusive 0–23), `endHour` (exclusive; may wrap midnight), optional `daysOfWeek` (0=Sun…6=Sat; empty/omit = every day).

**MenuItem:** `id`, `name`, `description`, `category`, `priceCents`, `image`, optional `popular`, `eightySixed`, `happyHour`, `origin`, `vintageYear`, `prepGuide`, `pairingNotes`, `ingredients`, `modifierGroups[]`.

**ModifierGroup / ModifierOption:** groups have `id`, `name`, `multi`, `options[]` with `id`, `name`, `priceDeltaCents`.

**OrderLine:** `id`, `menuItemId`, `quantity`, `guestId`, `note`, `modifiers`, `kitchenStatus`, `sentToKitchenAt`, `orderNumber`, `sentByStaffId`, `courseFire`, `bumpedAt`, `bumpCount`, `unitPriceSnapshotCents` (null = live), `compReason` (null or reason string; when set line is $0).

**Guest:** `id`, `name`, `paidAt`, `payment`.

**PaymentTender:** `method`, `cashCents`, `cardCents`, `changeDueCents`, `paidAt`.

**TableOrder:** `id`, `label`, `checkKind`, `status`, `lines`, `guests`, `tipAmountPreset`, `tipCents`, `serviceChargeEnabled`, `serviceChargePercent`, `billGeneratedAt`, `paidAt`, `payment`, `guestSignatureDataUrl`, `guestPreferredPayment`, `guestBillApprovedAt`.

**SaleRecord:** includes `compCents`, `orderNumbers[]`, guest fields, payment, serverName, itemCount, money fields.

**RestaurantProfile:** name, tagline, address, phone, taxId, feedbackUrl.

**PosSettings:**
- `xcgPerUsd` (default 1.8)
- `defaultServiceChargePercent` (default 5) — **service charge, not tax**; legacy `tax*` migrates here
- `shiftOpenedAt` / `shiftClosedAt`
- `bumpAfterMinutes` (default 8)
- `idleLockMinutes` (default 5; 0 = off)
- `autoFireDrinks` (default **true**)

**StaffUser:** id, name, role, pin, initials.

**AppNotification kinds:** `kitchen_ticket` | `bar_ticket` | `server_ack` | `bump_alert` — with audienceRole, targetStaffId, readBy[].

**AuditEntry kinds:** `void_ticket` | `void_payment` | `void_line` | `comp`.

**PersistedState version: 6** — menu, tables, activeTableId, sales, restaurant, staff, activeStaffId, nextOrderSeq, notifications, settings, auditLog, updatedAt (epoch ms LWW).

**BillSnapshot:** receipt payload with items, guest breakdown, dual money fields, payment, signature, preferred payment.

---

## 6. STAFF ROLES, DEMO PINS, PERMISSIONS

### Seed staff (defaults.ts + backend seed)
| ID | Name | Role | PIN | Initials |
|---|---|---|---|---|
| staff_server | Alex Morgan | server | 1234 | AM |
| staff_kitchen | Casey Cook | kitchen | 2222 | CC |
| staff_bartender | Morgan Rum | bartender | 3333 | MR |
| staff_admin | Riley Admin | admin | 5555 | RA |
| staff_manager | Jordan Lee | manager | 9999 | JL |

### Views by role
| Role | Default view | Allowed views |
|---|---|---|
| kitchen | kitchen | kitchen only |
| bartender | bar | bar, service |
| server | service | service |
| admin | admin | service, kitchen, bar, reports, admin, users |
| manager | service | service, kitchen, bar, reports, admin, users |

Nav labels: Service, Kitchen, Bar, Sales, Menu, Users.

### Every permission (`roles.ts`)
| Function | True for |
|---|---|
| canManageUsers / canManageMenu / canViewSales | admin, manager |
| canCreateOrders | server, bartender, admin, manager |
| canSendToKitchen | server, admin, manager (**NOT bartender**) |
| canSendToBar | server, bartender, admin, manager |
| canGenerateBill / canTakePayment / canOpenBarTab | server, bartender, admin, manager |
| canCompLine(role, isDrink) | manager/admin any; bartender/server **drinks only** |
| canEightySix | bartender, kitchen, admin, manager |
| canRunKitchenBoard | kitchen, admin, manager |
| canRunBarBoard | bartender, admin, manager |
| canUpdateBeverageStatus | bartender, server, admin, manager |
| canDeleteMenuItems | admin, manager |
| canClearOrder / canReopenTable / canVoidKitchenItems / canDeleteTickets / canDeletePayments | **manager only** |

Server `change_staff_pin` should reject new PINs in the demo set `{1234,2222,5555,9999}` (note: **3333 may not be in blocklist** in current code — preserve or tighten consistently).

---

## 7. STATION DEEP-LINKS & RECEIPT SHARE

### `?station=` deep-links (`posLogic.ts`)
URL: `{origin}{pathname}?station={key}`

Keys: `service`, `kitchen`, `bar`, `reports`, `admin`, `users`

Aliases:
- `floor` / `pos` → service
- `expo` / `kds` → kitchen
- `drinks` / `beverage` / `bartender` → bar
- `sales` → reports
- `menu` → admin

On boot: parse station → select a staff who `canAccessView` → set view. AdminPanel lists copyable links for Service / Kitchen expo / Bar rail / Sales / Menu admin.

### Receipt share
Hash `#bill={base64 BillSnapshot}` opens shared receipt view (`decodeSnapshot`).

---

## 8. FLOOR SERVICE FLOW

### Service view composition
1. **TableMap** — floor tables with status tones (`paid` | `partial` | `ready` | `prep` | `open`) + **Bar tabs** section with “Open tab” (guest name/seat) → `createBarTab` → `checkKind: 'bar_tab'`, label `Tab · {name}`
2. **ServiceMenu** — category chips: All, Mains, Starters, Drinks, Wine List, Champagne, Rum, Desserts; search; popular; 86 badge; Happy Hour badge; expandable **Prep · ingredients · pairing** intel
3. **OrderPanel** — lines with qty, guest assign, course fire, beverage status advance, trash, **Comp**; summary with pre-comp leakage; actions **Fire drinks now**, **Send food to kitchen**, **Generate bill**

### Adding items
- Modifier modal when groups exist (Prep / Side swap for food; Drink options for beverages)
- Lock `unitPriceSnapshotCents` at add (menu effective price + modifiers, including happy hour)
- If item `eightySixed` → block add / grey out
- If beverage and `settings.autoFireDrinks` and role `canSendToBar` → immediately fire to bar

### Send paths (`posLogic.ts`)
- `applySendFoodToKitchen` — only **food** draft lines → `queued`, assign `ORD-YYYYMMDD-####`, notify `kitchen_ticket` + `server_ack`
- `applySendDrinksToBar` — only **beverage** draft lines → same pattern with `bar_ticket`

### Course fire
Per-line chips: Hold / Fire / All-day. Bump can escalate hold→fire. `fireHeldLines` available on boards.

---

## 9. KITCHEN BOARD vs BAR RAIL

Shared component `KitchenBoard` with `board="kitchen" | "bar"`:
- Filter tickets by food vs beverage categories
- Status tabs: queued → preparing → ready → served
- Course filter; late visual via `bumpAfterMinutes` (default 8)
- Bump / recall; fire all held
- **86 list chip rail** for quick stock toggle (`canEightySix`)
- Manager delete tickets (`canDeleteTickets`)
- Bar empty copy: tickets appear after Service sends them to the bar (or auto-fire)

---

## 10. BAR REVENUE TOOLKIT (ALL REQUIRED)

1. **Auto-fire drinks** — `autoFireDrinks` default true; Admin toggle; “Fire drinks now” button
2. **Happy hour / pour pricing** — `HappyHourWindow` on MenuItem; default window **16:00–19:00** local; seeded on Red Stripe (550→400), Dragon Stout (600→450), Rum Punch (950→750)
3. **Standup bar tabs** — `checkKind: 'bar_tab'`; open by guest name on TableMap; editable like tables
4. **Comps & voids** — `compReason` zeros line; audit `comp`; sales track `compCents`; void presets; manager gates for destructive ops
5. **86 list** — `eightySixed` on MenuItem; toggle on bar/kitchen boards + admin; greyed/blocked on Service

---

## 11. FULL DEFAULT MENU CATALOG (80 ITEMS)

### Food (10) — `defaults.ts`
**Mains:** Jerk Chicken ($24.50), Ackee & Saltfish ($28.90), Curry Goat ($26.80), Oxtail Stew ($29.90)  
**Starters:** Festival & Sweet Plantain ($9.90), Callaloo Sauté ($8.50), Roasted Breadfruit ($7.50), Fresh Julie Mango ($6.50)  
**Desserts:** Sweet Potato Pudding ($10.80), + second dessert in seed (preserve file)  

Core modifier groups on meals:
- **Prep** (multi): No onion, Extra spicy, No scotch bonnet
- **Side swap** (single): Rice & peas ($0), Festival (+$1.00), Sweet plantain (+$1.25), Callaloo (+$1.50)
- Jerk Chicken also has **Heat**: Mild / Yard hot / Extra bonnet (+$0.50)

### Drinks / Mocktails (25) — category `Drinks`
Virgin Mojito, Shirley Temple, Virgin Piña Colada, Arnold Palmer, Virgin Margarita, Cinderella, Nojito, Island Fruit Punch, Virgin Bloody Mary, Coconut Cooler, Mango Lassi Cooler, Ginger Beer Cooler, Lemonade Sparkler, Passion Fruit Cooler, Virgin Daiquiri, Apple Spritz NA, Cucumber Mint Cooler, Hibiscus Lemonade, Pineapple Ginger Fizz, Watermelon Agua Fresca, Berry Smash NA, Tropical Sunrise, **Sorrel Punch**, Jelly Coconut Water, Lime & Soda  
Drink modifiers: Less ice, No ice.

### Wine List (8) — category `Wine` (chip label “Wine List”)
| Name | Origin | Vintage | Price |
|---|---|---|---|
| Cloudy Bay Sauvignon Blanc | Marlborough, New Zealand | 2023 | $42.00 |
| Kim Crawford Pinot Noir | Marlborough, New Zealand | 2022 | $38.00 |
| Château Ste. Michelle Chardonnay | Columbia Valley, USA | 2022 | $32.00 |
| Trapiche Oak Cask Malbec | Mendoza, Argentina | 2021 | $29.00 |
| Frescobaldi Chianti | Tuscany, Italy | 2021 | $36.00 |
| Josh Cellars Cabernet Sauvignon | California, USA | 2021 | $34.00 |
| Villa Maria Private Bin Riesling | Hawke’s Bay, New Zealand | 2023 | $31.00 |
| Yellow Tail Shiraz | South Eastern Australia | 2022 | $24.00 |

### Champagne (5)
Moët & Chandon Impérial ($85), Veuve Clicquot Yellow Label ($92), Dom Pérignon Vintage 2013 ($285), Ruinart Blanc de Blancs ($145), Nicolas Feuillatte Réserve ($68) — with French origins.

### Rum tab (7 bottles/beer + 25 cocktails) — category `Rum`
**Bottles/beer:** Appleton Estate Signature, Wray & Nephew Overproof, Myers’s Original Dark, Mount Gay Eclipse, Diplomático Reserva Exclusiva, Red Stripe, Dragon Stout  
**Cocktails:** Rum Punch, Mojito, Piña Colada, Daiquiri, Mai Tai, Dark ’n’ Stormy, Cuba Libre, Painkiller, Hurricane, Zombie, Rum Old Fashioned, Bahama Mama, Hot Buttered Rum, Espresso Martini, Margarita, Cosmopolitan, Negroni, Whiskey Sour, Long Island Iced Tea, Moscow Mule, Gin & Tonic, Old Fashioned, Manhattan, Aperol Spritz, Caipirinha  
Cocktail modifiers include Strong pour (+$1.50).

Images: `/menu/1.svg`… food, `/menu/7.svg` drinks, `/menu/8.svg` bottles/wine; market SVGs under `/public/market/`.

On seed, apply local AI enrich so `prepGuide` / `ingredients` / `pairingNotes` are filled (`applyEnrichment(localEnrichMenuItem)`).

---

## 12. MENU ADMIN — MEALS vs BAR (SEPARATE WORKFLOWS)

`AdminPanel` must expose a **catalog kind toggle**:
- **Meals / kitchen** — categories Mains/Starters/Desserts; Prep & Side swap editors; photo upload/URL/stock picker; **no** wine origin/vintage/happy-hour fields as primary
- **Bar / beverages** — categories Drinks/Wine/Champagne/Rum; origin, vintage year, happy hour window, 86; drink modifier groups; **no** meal Prep/Side as primary

Shared admin capabilities:
- Add / edit / delete items (`canDeleteMenuItems`)
- **Generate with GPT-4o** button → enrich description, prepGuide, pairingNotes, ingredients
- Settings: XCG rate, default service charge %, bump minutes, idle lock minutes, auto-fire drinks
- Station deep-link list
- Void/comp audit log viewer

`UsersPanel` for staff CRUD (admin/manager).

---

## 13. GPT-4o MENU INTELLIGENCE

### Purpose
Professional culinary/bar copy only: prep method, ingredients, wine↔Jamaican meal pairings. **Never invent prices, tax, ABV math, or totals.**

### SPA (`menuAi.ts`)
- `localEnrichMenuItem()` — deterministic high-quality fallback (works offline)
- `enrichMenuItem()` — remote if server mode + configured, else local
- `applyEnrichment()` — merge fields without touching `priceCents`

### API
`POST /pos/ai/enrich-menu-item`  
Auth required; roles: admin, manager, bartender, server  
Body: `{ name, category, description, origin?, vintageYear? }`  
Response: `{ description, prepGuide, pairingNotes, ingredients, source: 'gpt-4o' | 'local' }`  
Env: `OPENAI_API_KEY`, optional `OPENAI_MENU_MODEL`  
`GET /pos/config` exposes `openaiMenuEnrich` boolean.

System prompt must explicitly forbid money math.

---

## 14. MONEY MATH (`math.ts`) — HARD RULES

| Rule | Implementation |
|---|---|
| Unit | Integer **USD cents** everywhere in state |
| FX | `usdCentsToXcgCents` / `xcgCentsToUsdCents` with `Math.round`; active rate from settings |
| Display | `moneyUsd`, `moneyXcg`, `formatDual` |
| Service charge | `% of subtotal` when enabled (default 5%) — not TOT tax engine |
| Tip | Fixed-cent presets or custom cents — **not** percent tips (migrate legacy %) |
| Happy hour | Time/day window replaces base menu price before modifiers |
| Unit price | comp → 0; else snapshot if set; else effective menu + modifiers |
| Comp leakage | `compCents` = pre-comp unit × qty |
| Bill | `computeBill` → subtotal, serviceCharge, tip, total, guestBreakdown, compCents |
| Payment | `computePayment` cash/card/mixed + changeDue |
| Sales | `summarizeSales`, `salesToCsv` including comps |
| Order numbers | `ORD-YYYYMMDD-####` via `formatOrderNumber` |

**Allyanna note:** Full SXM TOT / wage tax / SZV `decimal.Decimal` engines are a separate product surface. This POS uses integer cents + configurable service charge + FX. Do not hardcode tax brackets into bill formulas.

---

## 15. GUEST BILL → PAYMENT → SALES → VOIDS

1. Authorized role generates bill → `billGeneratedAt`
2. `GuestBillModal`: review dual totals, tip prefs, canvas signature, preferred payment → `guestBillApprovedAt` + `guestPreferredPayment`
3. `canGuestTakePayment` requires approval + preferred method
4. `PaymentModal`: cash / card / mixed; tender in USD or XCG (convert via FX); whole-table or per-guest; status `partial` / `paid`
5. Optional Stripe PaymentIntent when keys configured (recorded card — **not** Terminal hardware)
6. Append `SaleRecord`; in server mode `POST /pos/sales` → **immutable ledger**
7. SalesReport: day summary, shift open/close, CSV export, owner ops, **Backup DB** (manager + server mode)
8. Void sale: manager + reason → `POST /pos/sales/{id}/void`; audit `void_payment`
9. Line/ticket voids and comps → `auditLog` (cap ~200) + optional `POST /pos/audit`
10. Manager PIN re-auth for destructive SPA ops (`requireManager`)
11. Receipts: guest / kitchen (food-only, no payment) / paid; share via `#bill=`

---

## 16. PRODUCTION HARDENING (MUST SHIP)

| Control | Detail |
|---|---|
| Hashed PINs | PBKDF2-HMAC-SHA256, ~210k iters; never return pins in snapshots (`pin: ""`) |
| Force PIN change | `POS_FORCE_PIN_CHANGE=1` (Docker default); `mustChangePin` blocks mutations |
| Hide demo credentials | `POS_HIDE_DEMO_CREDENTIALS=1` |
| PIN lockout | `POS_PIN_MAX_ATTEMPTS=5`, lockout ~900s; HTTP 429 `pin_locked` |
| Session TTL | `POS_SESSION_TTL_HOURS=12` |
| Server idle revoke | `POS_SESSION_IDLE_MINUTES=30` |
| Station idle lock UI | `settings.idleLockMinutes` default 5; `useIdleLock` |
| Optimistic concurrency | snapshot `revision`; PUT 409 conflict |
| Owner ops | `GET/POST /pos/ops/summary`, `/backup`, `/backup/latest`, `/sales.csv` |
| Compose | persistent volume `pos-data:/data`; CORS via `POS_CORS_ORIGINS` |
| Backup script | `scripts/backup-pos.sh` local or `--remote` |

Docker Compose env defaults (preserve):
```
POS_FORCE_PIN_CHANGE=1
POS_HIDE_DEMO_CREDENTIALS=1
POS_PIN_MAX_ATTEMPTS=5
POS_PIN_LOCKOUT_SECONDS=900
POS_SESSION_IDLE_MINUTES=30
POS_SESSION_TTL_HOURS=12
```

---

## 17. PERSISTENCE & MIGRATIONS

- Current key: `savory-bill-generator-v6`
- Legacy keys: v5…v1 — read then rewrite to v6
- `PersistedState.version = 6`
- Migrations must handle: restaurant rename from Savory*; tip %→cents; tax→serviceCharge; bar_tab detection; menu enrich fill; merge missing seed items; staff role fill (including bartender); settings defaults (`autoFireDrinks`, idle lock, bump); auditLog; updatedAt LWW
- Local: BroadcastChannel + storage events
- Server: poll 2s / push ~500ms; bootstrap empty menu from SPA defaults via `POST /pos/bootstrap`

---

## 18. COMPLETE API SURFACE (`/pos`)

### Unauthenticated
- `GET /pos/health`
- `GET /pos/config` — stripe/openai/forcePin/hideDemo flags
- `GET /health` (app)

### Auth
- `POST /pos/auth/login` `{ pin, tenantId? }`
- `POST /pos/auth/logout`
- `GET /pos/auth/me`
- `POST /pos/auth/change-pin` `{ currentPin, newPin }`

### State
- `GET /pos/state`
- `PUT /pos/state` `{ state, expectedRevision? }` — 409 on conflict
- `POST /pos/bootstrap` `{ menu, tables? }`

### Ledger
- `POST /pos/sales` `{ sale }`
- `POST /pos/sales/{sale_id}/void` `{ reason }` — manager
- `POST /pos/audit` `{ entry }`

### Staff
- `GET /pos/staff`
- `POST /pos/staff` `{ name, role, pin, initials }`
- `DELETE /pos/staff/{staff_id}`

### Payments
- `POST /pos/payments/card-intent`
- `GET /pos/payments/card-intent/{intent_id}`

### Ops (manager/admin)
- `GET /pos/ops/summary`
- `POST /pos/ops/backup`
- `GET /pos/ops/backup/latest`
- `GET /pos/ops/sales.csv`

### AI
- `POST /pos/ai/enrich-menu-item`

Tenant isolation: every query scoped by `tenant_id` (seed `DEFAULT_TENANT_ID`). Postgres RLS policies exist in migration for future Allyanna join.

---

## 19. UI / UX REQUIREMENTS

- Multi-station POS shell: sticky topbar with **Authentic Jamaican** brand mark, role badge, notifications, lock, view tabs filtered by role
- Jamaican country-market atmosphere (wood texture, bush green, mango gold, Fraunces + Manrope)
- Service: map + menu + order — not a generic SaaS dashboard of stat cards
- Kitchen/Bar: ticket cards with status progression, bump timers, 86 rail
- Modals: PIN, change PIN, modifiers, void/comp reasons, guest bill (signature), payment, receipt
- Dual-currency prices everywhere guests/staff see money
- Mobile + tablet usable; station deep-links for dedicated tablets
- Motion: intentional presence (at least subtle transitions on view/ticket/ready alerts) — not noise
- No emoji-driven UI; no purple glow aesthetic

---

## 20. TESTS (MUST KEEP / EXTEND)

### Vitest (~21 tests)
- `math.test.ts` — FX, tip/service, change, kitchen receipt, happy hour/comps
- `posLogic.test.ts` — food vs drinks send, guest approval, tones, bump/recall, late, stations, all paid
- `roles.test.ts` — kitchen/bartender/server/manager matrix
- `menuAi.test.ts` — wine pairings; preserve description
- `storage.test.ts` — v6 defaults

### pytest (~12 tests)
- `test_pos_auth_ledger.py` — health, bad PIN, login/state, immutable sales void, optimistic concurrency
- `test_pos_hardening.py` — config flags, PIN lockout, must_change_pin, change PIN, backup/ops, idle revoke
- `test_menu_ai.py` — local enrich wine → Jamaican meals

E2E SPA+API CI is still outstanding — do not claim it exists.

---

## 21. EXPLICITLY OUT OF SCOPE (DO NOT FAKE AS DONE)

1. Stripe **Terminal** hardware integration
2. ESC-POS / kitchen receipt **printers**
3. Cloudflare Tunnel automation (not in repo)
4. Full Allyanna TOT / wage tax / SZV engines inside this POS
5. OCR / GPT-4o vision invoice intake
6. Live Postgres adapter as default runtime (migration only)
7. Master-account multi-business switcher UI
8. Claiming E2E CI coverage that is not implemented

---

## 22. PILOT DEPLOY RECIPE

```bash
# API
docker compose up -d --build
# SPA .env
PUBLIC_POS_API_URL=http://localhost:8000
# Local-only demo: leave PUBLIC_POS_API_URL unset
npm run dev   # Astro :4321
```

Go-live checklist: HTTPS + volume; set CORS; rotate all PINs; confirm idle lock; Stripe optional; schedule backups; printers later.

Demo PINs (local / first login before rotation):  
**Server 1234 · Kitchen 2222 · Bartender 3333 · Admin 5555 · Manager 9999**

---

## 23. ACCEPTANCE CRITERIA (DEFINITION OF DONE)

A correct Emergent build of this product must demonstrate:

1. Brand **Authentic Jamaican Cuisine & Bar** with SXM address and coal-pot market theme  
2. Dual USD/XCG @ configurable 1.80  
3. LocalStorage mode AND server mode  
4. All five roles + permission matrix including bartender/bar  
5. Kitchen vs Bar boards; send food vs fire drinks; autoFireDrinks  
6. Bar tabs, happy hour, comps, 86 list  
7. Full catalog: 25 mocktails, 8 wines (origin+vintage), 5 champagnes, rum bottles + 25 cocktails, Jamaican food  
8. Menu admin **Meals** workflow separate from **Bar** workflow  
9. GPT-4o enrich with offline local fallback; **zero LLM money math**  
10. Guest bill signature → payment → sales ledger → manager voids/audits  
11. PIN lockout, force PIN change, idle lock, backups  
12. Station deep-links `?station=bar|kitchen|service|…`  
13. PersistedState v6 migrations from legacy keys  
14. Automated unit tests for math, roles, posLogic, menu AI, auth hardening  

---

## 24. WORKING STYLE FOR EMERGENT AI

When implementing or modifying:

- Prefer extending existing modules (`bill/*`, `backend/app/pos/*`) over inventing parallel systems  
- Keep financial logic centralized in `math.ts` / payment routes  
- Keep AI limited to enrichment schemas  
- Preserve integer cents and dual-currency display  
- After changes, run `npm test` and `npm run pos:test` (or `test:all`)  
- Do not remove bar revenue features, bartender role, or Meals/Bar admin split  
- When adding menu items, enrich prep/ingredients/pairings and keep Meals vs Bar forms separate  
- Document any intentional deviation from this master prompt in the PR/commit message  

---

## 25. REFERENCE: KEY FUNCTION NAMES TO PRESERVE

`effectiveMenuPriceCents`, `isHappyHourActive`, `unitPriceCents`, `preCompUnitPriceCents`, `computeBill`, `computePayment`, `buildSnapshot`, `summarizeSales`, `salesToCsv`, `applySendFoodToKitchen`, `applySendDrinksToBar`, `bumpKitchenLine`, `recallKitchenLine`, `setLineCourseFire`, `fireHeldLines`, `appendAudit`, `canGuestTakePayment`, `parseStationParam`, `stationDeepLink`, `viewsForRole`, `canCompLine`, `canEightySix`, `canSendToBar`, `canOpenBarTab`, `enrichMenuItem`, `localEnrichMenuItem`, `applyEnrichment`, `createTable`, `createBarTab`, `createDefaultState`, `normalizeState`, `loadState`, `saveState`, `isServerMode`, `usePosServer`, `usePosSync`, `useIdleLock`.

---

**END OF MASTER PROMPT — LEAVE NOTHING OUT.**  
This document is the authoritative rebuild/extension brief for Emergent AI for the Restaurant Bill Generator / Authentic Jamaican Cuisine & Bar POS as of the pilot-hardening + bar-revenue + GPT-4o enrich + Meals/Bar admin codebase.
