import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCartButton } from "@/components/AddToCartButton";
import {
  PRODUCTS,
  SHIPPING_NOTE,
  formatMoney,
  getProduct,
} from "@/lib/products";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) return { title: "Product" };
  return {
    title: product.name,
    description: product.tagline,
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();

  return (
    <div className="container">
      <nav className="page-hero" style={{ paddingBottom: "0.5rem" }}>
        <Link href="/shop" style={{ color: "var(--ink-soft)", fontSize: "0.95rem" }}>
          ← Back to shop
        </Link>
      </nav>
      <div className="pdp" style={{ ["--accent" as string]: product.accent }}>
        <div className="pdp__visual">
          <span>{product.name}</span>
        </div>
        <div>
          <p className="eyebrow">Deskora product</p>
          <h1 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", margin: "0.35rem 0 0.75rem" }}>
            {product.name}
          </h1>
          <p style={{ color: "var(--ink-soft)", marginBottom: "0.75rem" }}>
            {product.tagline}
          </p>
          <p>{product.benefit}</p>
          <div className="price-row">
            <span className="now">{formatMoney(product.priceCents)}</span>
            {product.compareAtCents ? (
              <span className="was">{formatMoney(product.compareAtCents)}</span>
            ) : null}
          </div>
          <ul className="pdp__facts">
            <li>
              <strong>Problem:</strong> {product.problem}
            </li>
            <li>
              <strong>Materials:</strong> {product.materials}
            </li>
            <li>
              <strong>Includes:</strong> {product.includes.join(", ")}
            </li>
            <li>
              <strong>Weight:</strong> {product.weight}
            </li>
            <li>
              <strong>Ships in:</strong> {product.shipsInDays}
            </li>
          </ul>
          <p className="ship-note">{SHIPPING_NOTE}</p>
          <div className="hero__actions">
            <AddToCartButton slug={product.slug} />
            <Link href="/cart" className="btn btn-ghost">
              View cart
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
