import type { Metadata } from "next";
import { ProductTile } from "@/components/ProductTile";
import { PRODUCTS } from "@/lib/products";

export const metadata: Metadata = {
  title: "Shop",
  description: "Compact desk tools for apartment remote workers. Ships to the US.",
};

export default function ShopPage() {
  return (
    <div className="container">
      <header className="page-hero">
        <p className="eyebrow">Shop</p>
        <h1>The desk kit</h1>
        <p>
          Eight focused products for small desks. Placeholder catalog—supplier
          samples come next.
        </p>
      </header>
      <div className="product-grid" style={{ paddingBottom: "4rem" }}>
        {PRODUCTS.map((product) => (
          <ProductTile key={product.slug} product={product} />
        ))}
      </div>
    </div>
  );
}
