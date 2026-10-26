import Link from "next/link";
import { formatMoney, type Product } from "@/lib/products";
import { AddToCartButton } from "./AddToCartButton";

export function ProductTile({ product }: { product: Product }) {
  return (
    <article
      className="product-tile"
      style={{ ["--accent" as string]: product.accent }}
    >
      <Link href={`/product/${product.slug}`} className="product-tile__swatch" />
      <div className="product-tile__body">
        <p className="eyebrow">{product.categoryLabel}</p>
        <h3>
          <Link href={`/product/${product.slug}`}>{product.name}</Link>
        </h3>
        <p>{product.tagline}</p>
        <div className="product-tile__meta">
          <span>{formatMoney(product.priceCents)}</span>
          <AddToCartButton
            slug={product.slug}
            label="Add"
            className="btn btn-ghost"
          />
        </div>
      </div>
    </article>
  );
}
