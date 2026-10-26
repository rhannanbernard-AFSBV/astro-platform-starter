"use client";

import Link from "next/link";
import { BRAND } from "@/lib/products";
import { useCart } from "@/lib/cart";

export function Header() {
  const { itemCount } = useCart();

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link href="/" className="brand" aria-label={`${BRAND.name} home`}>
          Desk<span>ora</span>
        </Link>
        <nav className="nav" aria-label="Primary">
          <Link className="hide-sm" href="/#why">
            Why Deskora
          </Link>
          <Link href="/shop">Shop</Link>
          <Link className="hide-sm" href="/policies/shipping">
            Shipping
          </Link>
          <Link href="/cart" className="cart-pill" aria-label={`Cart, ${itemCount} items`}>
            Cart <strong>{itemCount}</strong>
          </Link>
        </nav>
      </div>
    </header>
  );
}
