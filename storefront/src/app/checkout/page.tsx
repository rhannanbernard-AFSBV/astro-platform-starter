"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useCart } from "@/lib/cart";
import { formatMoney } from "@/lib/catalog-types";

type ShopifyStatus = {
  enabled: boolean;
  checkoutReady: boolean;
  productsWithVariantId: number;
  productsTotal: number;
  storeDomain: string | null;
};

export default function CheckoutPage() {
  const { lines, itemCount, subtotalCents, clear, resolve } = useCart();
  const [submitted, setSubmitted] = useState(false);
  const [shopify, setShopify] = useState<ShopifyStatus | null>(null);
  const [shopifyError, setShopifyError] = useState("");
  const [shopifyLoading, setShopifyLoading] = useState(false);

  useEffect(() => {
    fetch("/api/shopify/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: ShopifyStatus) => setShopify(data))
      .catch(() => setShopify(null));
  }, []);

  if (itemCount === 0 && !submitted) {
    return (
      <div className="container">
        <header className="page-hero">
          <p className="eyebrow">Checkout</p>
          <h1>Nothing to check out</h1>
          <p>Add products to your cart first.</p>
        </header>
        <div className="empty-state">
          <Link href="/shop" className="btn btn-primary">
            Go to shop
          </Link>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="container">
        <header className="page-hero">
          <p className="eyebrow">Order received</p>
          <h1>Thanks—your request is logged.</h1>
          <p>
            This local demo checkout does not charge a card. For live payments,
            use Checkout with Shopify after linking variant IDs.
          </p>
        </header>
        <div className="empty-state">
          <Link href="/shop" className="btn btn-primary">
            Back to shop
          </Link>
        </div>
      </div>
    );
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clear();
    setSubmitted(true);
  }

  async function checkoutWithShopify() {
    setShopifyLoading(true);
    setShopifyError("");
    try {
      const res = await fetch("/api/shopify/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((line) => ({ slug: line.slug, qty: line.qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Shopify checkout failed");
      clear();
      window.location.href = data.checkoutUrl as string;
    } catch (err) {
      setShopifyError(err instanceof Error ? err.message : "Checkout failed");
      setShopifyLoading(false);
    }
  }

  return (
    <div className="container">
      <header className="page-hero">
        <p className="eyebrow">Checkout</p>
        <h1>Ship to the United States</h1>
        <p>
          Subtotal {formatMoney(subtotalCents)}. Prefer Shopify for live card
          capture when Storefront credentials and variant IDs are set.
        </p>
      </header>

      <ul
        style={{
          listStyle: "none",
          marginBottom: "1.5rem",
          color: "var(--ink-soft)",
        }}
      >
        {lines.map((line) => {
          const resolved = resolve(line);
          if (!resolved) return null;
          return (
            <li key={line.slug}>
              {resolved.qty}× {resolved.product.name} —{" "}
              {formatMoney(resolved.product.priceCents * resolved.qty)}
              {resolved.product.shopifyVariantId ? " · Shopify linked" : ""}
            </li>
          );
        })}
      </ul>

      {shopify?.enabled ? (
        <div className="editor-card" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "0.75rem" }}>
            Checkout with Shopify
          </h2>
          <p style={{ color: "var(--ink-soft)", marginBottom: "1rem" }}>
            Store: {shopify.storeDomain}. Linked variants:{" "}
            {shopify.productsWithVariantId}/{shopify.productsTotal}.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={shopifyLoading || !shopify.checkoutReady}
            onClick={checkoutWithShopify}
          >
            {shopifyLoading ? "Redirecting…" : "Checkout with Shopify"}
          </button>
          {!shopify.checkoutReady ? (
            <p className="ship-note" style={{ marginTop: "0.75rem" }}>
              Add <code>shopifyVariantId</code> on each product in Edit
              placeholders after importing{" "}
              <a href="/api/shopify/export?format=csv">the Shopify CSV</a>.
            </p>
          ) : null}
          {shopifyError ? (
            <p className="editor-status err" style={{ marginTop: "0.75rem" }}>
              {shopifyError}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="editor-card" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "0.75rem" }}>
            Shopify not connected yet
          </h2>
          <p style={{ color: "var(--ink-soft)", marginBottom: "0.75rem" }}>
            Download the build CSV, import it in Shopify Admin → Products →
            Import, then set env vars and variant GIDs.
          </p>
          <div className="hero__actions">
            <a href="/api/shopify/export?format=csv" className="btn btn-primary">
              Download Shopify CSV
            </a>
            <Link href="/placeholders" className="btn btn-ghost">
              Edit placeholders
            </Link>
          </div>
        </div>
      )}

      <form className="checkout-form" onSubmit={onSubmit}>
        <p className="eyebrow">Local demo checkout</p>
        <label>
          Full name
          <input name="name" required autoComplete="name" />
        </label>
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Address line 1
          <input name="address1" required autoComplete="address-line1" />
        </label>
        <label>
          City
          <input name="city" required autoComplete="address-level2" />
        </label>
        <label>
          State
          <input name="state" required autoComplete="address-level1" />
        </label>
        <label>
          ZIP
          <input name="zip" required autoComplete="postal-code" />
        </label>
        <label>
          Country
          <select name="country" defaultValue="US" required>
            <option value="US">United States</option>
          </select>
        </label>
        <button type="submit" className="btn btn-ghost">
          Place demo order (no charge)
        </button>
        <p style={{ color: "var(--ink-soft)", fontSize: "0.92rem" }}>
          By placing an order you agree to our{" "}
          <Link href="/policies/shipping">shipping</Link> and{" "}
          <Link href="/policies/returns">returns</Link> policies.
        </p>
      </form>
    </div>
  );
}