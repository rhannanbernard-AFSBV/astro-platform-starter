"use client";

import Link from "next/link";
import { useCatalog } from "@/lib/catalog-context";
import { useCart } from "@/lib/cart";

export function Header() {
  const { itemCount } = useCart();
  const { catalog } = useCatalog();
  const name = catalog.brand.name;
  const accent = name.length > 4 ? name.slice(-4) : name.slice(-2);
  const lead = name.slice(0, Math.max(0, name.length - accent.length));

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link href="/" className="brand" aria-label={`${name} home`}>
          {lead}
          <span>{accent}</span>
        </Link>
        <nav className="nav" aria-label="Primary">
          <Link className="hide-sm" href="/#departments">
            Departments
          </Link>
          <Link href="/shop">Shop</Link>
          <Link className="hide-sm" href="/placeholders">
            Edit placeholders
          </Link>
          <Link className="hide-sm" href="/policies/shipping">
            Shipping
          </Link>
          <Link
            href="/cart"
            className="cart-pill"
            aria-label={`Cart, ${itemCount} items`}
          >
            Cart <strong>{itemCount}</strong>
          </Link>
        </nav>
      </div>
    </header>
  );
}
