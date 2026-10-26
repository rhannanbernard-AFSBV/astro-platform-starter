import type { Metadata } from "next";
import { ProductTile } from "@/components/ProductTile";
import { getCatalog, productsByCategory } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Shop",
  description: "Shop Northlane departments and placeholder products.",
};

export default function ShopPage() {
  const { categories } = getCatalog();

  return (
    <div className="container">
      <header className="page-hero">
        <p className="eyebrow">Shop</p>
        <h1>All departments</h1>
        <p>
          Edit department blurbs and products anytime under Edit placeholders.
        </p>
      </header>

      {categories.map((cat) => {
        const items = productsByCategory(cat.id);
        if (items.length === 0) return null;
        return (
          <section
            key={cat.id}
            id={cat.id}
            className="shop-department"
            style={{ paddingBottom: "2.75rem" }}
          >
            <div className="section__head" style={{ marginBottom: "1.25rem" }}>
              <p className="eyebrow">{cat.label}</p>
              <h2 style={{ fontSize: "1.7rem", margin: "0.25rem 0" }}>
                {cat.blurb}
              </h2>
            </div>
            <div className="product-grid">
              {items.map((product) => (
                <ProductTile key={product.slug} product={product} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
