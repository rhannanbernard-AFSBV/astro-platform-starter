# Northlane storefront

High-converting Next.js dropshipping storefront for **Northlane** — multi-niche lifestyle shop for the United States.

## Locked recommendations

| Decision | Choice |
| --- | --- |
| Niche | Bed, bath, kitchens, home decor, jewelry, women's fashion, pet accessories, video games |
| Customers | United States, USD |
| Stack | Next.js App Router in `storefront/` |
| Supplier | Placeholder catalog until samples are ordered |
| Brand | **Northlane** — teal + cool paper palette, Syne + Source Sans 3 |

## Run locally

```bash
cd storefront
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## What is included

- Landing page with department grid, featured SKU, product kit, trust strip, CTA
- Shop grouped by department + product detail pages
- LocalStorage cart and demo checkout (no payment processor yet)
- Shipping, returns, and about pages with honest 8–14 business day shipping copy
- **Manual placeholder editor** at [`/placeholders`](http://localhost:3000/placeholders) (also editable as `data/catalog.json`)

## Edit placeholders

1. Open [http://localhost:3000/placeholders](http://localhost:3000/placeholders)
2. Change brand, hero copy, departments, or products
3. Click **Save placeholders** — writes `data/catalog.json`
4. Or edit `data/catalog.json` directly in your editor and refresh the browser

## Shopify-compatible build

Every `npm run build` (and `npm run shopify:export`) writes:

- `shopify/export/products.csv` — import in Shopify Admin → Products → Import
- `shopify/export/products.json` — JSON mirror

Live download: `/api/shopify/export?format=csv` or **Download Shopify CSV** on the placeholders page.

Optional headless checkout: copy `.env.example` → `.env.local`, add Storefront credentials + `shopifyVariantId` on products. See [`shopify/README.md`](shopify/README.md).

## Next steps for you

1. Replace placeholders via `/placeholders` after supplier samples
2. Import `shopify/export/products.csv` into Shopify (or connect Storefront checkout)
3. Register the business, open a bank account, and set your real support email
4. Pair with the AgentCore helper in `../agents/DropshipHelper` for FAQ and niche research
