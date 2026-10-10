# Guest order (Phase B)

Mobile guest surface at **`/order`** with printable QR at **`/order/qr`**.

## Loop (server mode)

1. Guest opens `/order` (or scans table QR).
2. Menu loads from **`GET /pos/guest/menu`** (POS catalog, or fallback Jamaican set).
3. Checkout → table # or pickup name → **`POST /pos/guest/orders`**.
4. POS snapshot gains an open check; food lines go **queued** to kitchen; drinks auto-fire to bar when enabled.
5. Guest polls **`GET /pos/guest/orders/{token}`** → Received → Preparing → Ready → Paid (when staff take payment).
6. Guest **pays at counter** (no in-app card in this phase).

## Env

```bash
PUBLIC_POS_API_URL=https://your-api.example.com
PUBLIC_GUEST_ORDER_URL=https://your-spa.example.com/order   # QR target
```

Without `PUBLIC_POS_API_URL`, the UI runs a **device-local demo** (status only; kitchen will not see the order).

## Staff

Orders appear as tables labeled `Table N` or `Pickup · Name`, with notifications for kitchen/bar. Complete payment on the Service station as usual.
