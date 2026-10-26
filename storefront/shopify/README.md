# Shopify compatibility

Northlane builds a Shopify Admin product import on every `npm run build`.

## Artifacts

| File | Use |
| --- | --- |
| `shopify/export/products.csv` | Shopify Admin → **Products → Import** |
| `shopify/export/products.json` | Machine-readable mirror of the same catalog |
| `GET /api/shopify/export?format=csv` | Live download from the running app |

Also available from **Edit placeholders → Download Shopify CSV**.

## Import flow

1. Run `npm run shopify:export` or `npm run build`
2. In Shopify Admin: **Products → Import →** upload `products.csv`
3. Open each product → copy the **variant GID** (`gid://shopify/ProductVariant/…`)
4. Paste into **Edit placeholders → Shopify variant GID** (or `shopifyVariantId` in `data/catalog.json`)
5. Create a Storefront API token with `cart` / `checkout` scopes
6. Set env vars from `.env.example` and restart `npm run dev`
7. Cart → Checkout → **Checkout with Shopify**

## Headless checkout

When `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_STOREFRONT_TOKEN` are set and products have `shopifyVariantId`, `POST /api/shopify/checkout` creates a Storefront cart and returns Shopify’s `checkoutUrl`.

Local demo checkout remains available without Shopify.

## Build

```bash
cd storefront
npm run build
```

`prebuild` always regenerates the CSV/JSON export so the build output stays Shopify-import compatible with the current placeholders.
