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

- Landing page with department grid, featured bed SKU, product kit, trust strip, CTA
- Shop grouped by department + product detail pages (8 placeholders)
- LocalStorage cart and demo checkout (no payment processor yet)
- Shipping, returns, and about pages with honest 8–14 business day shipping copy

## Next steps for you

1. Order product samples and replace placeholders in `src/lib/products.ts`
2. Connect Stripe or PayPal on the checkout page
3. Register the business, open a bank account, and set your real support email
4. Pair with the AgentCore helper in `../agents/DropshipHelper` for FAQ and niche research
