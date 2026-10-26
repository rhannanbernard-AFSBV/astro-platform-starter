"use client";

import Link from "next/link";
import { useCatalog } from "@/lib/catalog-context";

export function Footer() {
  const { catalog } = useCatalog();
  const { brand, categories } = catalog;
  const name = brand.name;
  const accent = name.length > 4 ? name.slice(-4) : name.slice(-2);
  const lead = name.slice(0, Math.max(0, name.length - accent.length));

  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div>
          <p className="brand">
            {lead}
            <span>{accent}</span>
          </p>
          <p style={{ marginTop: "0.65rem", maxWidth: "26rem" }}>
            {brand.tagline} Placeholder catalog for US customers until supplier
            samples are approved.
          </p>
        </div>
        <div>
          <h3>Departments</h3>
          <ul>
            {categories.slice(0, 4).map((cat) => (
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
              <Link href="/placeholders">Edit placeholders</Link>
            </li>
            <li>
              <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
