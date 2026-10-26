"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useCart } from "@/lib/cart";
import { formatMoney } from "@/lib/catalog-types";

export default function CheckoutPage() {
  const { lines, itemCount, subtotalCents, clear, resolve } = useCart();
  const [submitted, setSubmitted] = useState(false);

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
            This demo checkout does not charge a card. Connect Stripe or PayPal
            when you are ready to take real payments. We will email tracking
            after a supplier is live.
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

  return (
    <div className="container">
      <header className="page-hero">
        <p className="eyebrow">Checkout</p>
        <h1>Ship to the United States</h1>
        <p>
          Subtotal {formatMoney(subtotalCents)} · Demo form only—no payment
          processor connected yet.
        </p>
      </header>

      <ul style={{ listStyle: "none", marginBottom: "1.5rem", color: "var(--ink-soft)" }}>
        {lines.map((line) => {
          const resolved = resolve(line);
          if (!resolved) return null;
          return (
            <li key={line.slug}>
              {resolved.qty}× {resolved.product.name} —{" "}
              {formatMoney(resolved.product.priceCents * resolved.qty)}
            </li>
          );
        })}
      </ul>

      <form className="checkout-form" onSubmit={onSubmit}>
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
        <button type="submit" className="btn btn-primary">
          Place demo order
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