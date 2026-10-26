import Link from "next/link";
import { BRAND, CATEGORIES } from "@/lib/products";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div>
          <p className="brand">
            North<span>lane</span>
          </p>
          <p style={{ marginTop: "0.65rem", maxWidth: "26rem" }}>
            {BRAND.tagline} Placeholder catalog for US customers until supplier
            samples are approved.
          </p>
        </div>
        <div>
          <h3>Departments</h3>
          <ul>
            {CATEGORIES.slice(0, 4).map((cat) => (
              <li key={cat.id}>
                <Link href={`/shop#${cat.id}`}>{cat.label}</Link>
              </li>
            ))}
            <li>
              <Link href="/shop">All products</Link>
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
