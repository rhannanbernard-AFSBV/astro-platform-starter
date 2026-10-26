"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";
import { formatMoney } from "@/lib/catalog-types";

export default function CartPage() {
  const { lines, resolve, setQty, remove, subtotalCents, itemCount } = useCart();

  if (itemCount === 0) {
    return (
      <div className="container">
        <header className="page-hero">
          <p className="eyebrow">Cart</p>
          <h1>Your cart is empty</h1>
          <p>Add a desk tool from the shop, then come back to check out.</p>
        </header>
        <div className="empty-state">
          <Link href="/shop" className="btn btn-primary">
            Browse products
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <header className="page-hero">
        <p className="eyebrow">Cart</p>
        <h1>{itemCount} item{itemCount === 1 ? "" : "s"}</h1>
        <p>Review quantities, then continue to checkout.</p>
      </header>

      <div className="cart-table">
        {lines.map((line) => {
          const resolved = resolve(line);
          if (!resolved) return null;
          const { product, qty } = resolved;
          return (
            <div key={line.slug} className="cart-line">
              <div>
                <strong style={{ fontFamily: "var(--font-display)" }}>
                  <Link href={`/product/${product.slug}`}>{product.name}</Link>
                </strong>
                <div style={{ color: "var(--ink-soft)", fontSize: "0.92rem" }}>
                  {formatMoney(product.priceCents)} each · {product.shipsInDays}
                </div>
              </div>
              <div className="qty-control" aria-label={`Quantity for ${product.name}`}>
                <button type="button" onClick={() => setQty(line.slug, qty - 1)}>
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(e) => setQty(line.slug, Number(e.target.value) || 1)}
                />
                <button type="button" onClick={() => setQty(line.slug, qty + 1)}>
                  +
                </button>
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
                {formatMoney(product.priceCents * qty)}
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => remove(line.slug)}>
                Remove
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center", marginBottom: "3rem" }}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: "1.35rem", fontWeight: 700 }}>
          Subtotal {formatMoney(subtotalCents)}
        </p>
        <Link href="/checkout" className="btn btn-primary">
          Continue to checkout
        </Link>
        <Link href="/shop" className="btn btn-ghost">
          Keep shopping
        </Link>
      </div>
    </div>
  );
}
