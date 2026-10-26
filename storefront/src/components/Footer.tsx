import Link from "next/link";
import { BRAND } from "@/lib/products";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div>
          <p className="brand">
            Desk<span>ora</span>
          </p>
          <p style={{ marginTop: "0.65rem", maxWidth: "26rem" }}>
            {BRAND.tagline} Placeholder catalog for US customers until supplier
            samples are approved.
          </p>
        </div>
        <div>
          <h3>Shop</h3>
          <ul>
            <li>
              <Link href="/shop">All products</Link>
            </li>
            <li>
              <Link href="/product/cable-harbor">Cable Harbor</Link>
            </li>
            <li>
              <Link href="/cart">Cart</Link>
            </li>
          </ul>
        </div>
        <div>
          <h3>Help</h3>
          <ul>
            <li>
              <Link href="/policies/shipping">Shipping</Link>
            </li>
            <li>
              <Link href="/policies/returns">Returns</Link>
            </li>
            <li>
              <Link href="/about">About</Link>
            </li>
            <li>
              <a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
