import type { Metadata } from "next";
import { ProductTile } from "@/components/ProductTile";
import { CATEGORIES, productsByCategory } from "@/lib/products";

export const metadata: Metadata = {
  title: "Shop",
  description:
    "Shop Northlane departments: bed, bath, kitchens, home decor, jewelry, women's fashion, pet accessories, and video games.",
};

export default function ShopPage() {
  return (
    <div className="container">
      <header className="page-hero">
        <p className="eyebrow">Shop</p>
        <h1>All departments</h1>
        <p>
          Eight niches in one store. Placeholder catalog—supplier samples come
          next.
        </p>
      </header>

      {CATEGORIES.map((cat) => {
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
