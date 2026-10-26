import Link from "next/link";
import { AddToCartButton } from "@/components/AddToCartButton";
import { ProductTile } from "@/components/ProductTile";
import {
  formatMoney,
  getCatalog,
  getFeaturedProduct,
} from "@/lib/catalog";

export default function HomePage() {
  const catalog = getCatalog();
  const { brand, hero, categories, products, shippingNote } = catalog;
  const featured = getFeaturedProduct();
  const grid = products.filter((p) => p.slug !== featured?.slug);

  return (
    <>
      <section className="hero" aria-label="Hero">
        <div className="hero__media" aria-hidden="true" />
        <div className="container hero__content">
          <p className="eyebrow">{brand.name}</p>
          <h1>{hero.headline}</h1>
          <p>{hero.subhead}</p>
          <div className="hero__actions">
            <Link href="/shop" className="btn btn-light">
              {hero.primaryCta}
            </Link>
            {featured ? (
              <Link
                href={`/product/${featured.slug}`}
                className="btn btn-ghost"
                style={{
                  color: "#f4faf8",
                  borderColor: "rgba(244,250,248,0.35)",
                }}
              >
                {hero.secondaryCta}
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="section" id="departments">
        <div className="container">
          <div className="section__head">
            <p className="eyebrow">Departments</p>
            <h2>Shop by niche.</h2>
            <p>
              A clear aisle for every lifestyle corner—no junk drawer of random
              SKUs. Edit labels anytime under Edit placeholders.
            </p>
          </div>
          <div className="category-grid">
            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={`/shop#${cat.id}`}
                className="category-tile"
              >
                <span className="eyebrow">{cat.label}</span>
                <strong>{cat.blurb}</strong>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="why" style={{ paddingTop: 0 }}>
        <div className="container split">
          <div className="problem-panel">
            <p className="eyebrow" style={{ color: "#7dbea8" }}>
              The problem
            </p>
            <h3>Lifestyle carts get noisy fast.</h3>
            <p>
              Mega-stores bury good products under endless tabs. {brand.name}{" "}
              keeps focused niches, honest shipping, and placeholders you can
              edit until samples clear.
            </p>
          </div>
          <div>
            <p className="eyebrow">What you get</p>
            <h2
              style={{
                fontSize: "clamp(1.8rem, 3vw, 2.4rem)",
                margin: "0.4rem 0 1rem",
              }}
            >
              Clarity before checkout.
            </h2>
            <ul className="checklist">
              {categories.slice(0, 4).map((cat) => (
                <li key={cat.id}>
                  {cat.label}: {cat.blurb}
                </li>
              ))}
              <li>8–14 business day shipping shown on every product.</li>
            </ul>
          </div>
        </div>
      </section>

      {featured ? (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="section__head">
              <p className="eyebrow">Featured · {featured.categoryLabel}</p>
              <h2>Start with {featured.name}.</h2>
              <p>{featured.benefit}</p>
            </div>
            <div className="feature-product">
              <div className="feature-product__visual">
                <strong>{featured.name}</strong>
              </div>
              <div className="feature-product__copy">
                <p className="eyebrow">Best seller placeholder</p>
                <h2>{featured.tagline}</h2>
                <p>{featured.benefit}</p>
                <div className="price-row">
                  <span className="now">{formatMoney(featured.priceCents)}</span>
                  {featured.compareAtCents ? (
                    <span className="was">
                      {formatMoney(featured.compareAtCents)}
                    </span>
                  ) : null}
                </div>
                <p className="ship-note">{shippingNote}</p>
                <div className="hero__actions">
                  <AddToCartButton
                    slug={featured.slug}
                    label={`Add ${featured.name}`}
                  />
                  <Link
                    href={`/product/${featured.slug}`}
                    className="btn btn-ghost"
                  >
                    See details
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section__head">
            <p className="eyebrow">Across the store</p>
            <h2>Placeholder picks by department.</h2>
            <p>
              Edit names, prices, and copy in{" "}
              <Link href="/placeholders">Edit placeholders</Link> or in{" "}
              <code>data/catalog.json</code>.
            </p>
          </div>
          <div className="product-grid">
            {grid.map((product) => (
              <ProductTile key={product.slug} product={product} />
            ))}
          </div>
          <div style={{ marginTop: "1.75rem" }}>
            <Link href="/shop" className="btn btn-ghost">
              View all products
            </Link>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="trust-strip">
            <div className="trust-item">
              <h3>Honest shipping</h3>
              <p>{shippingNote}</p>
            </div>
            <div className="trust-item">
              <h3>US customers first</h3>
              <p>
                Prices in USD. Checkout and support copy written for United
                States delivery addresses.
              </p>
            </div>
            <div className="trust-item">
              <h3>Editable placeholders</h3>
              <p>
                Swap copy and SKUs before supplier samples—no code deploy
                required for local edits.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="container">
        <div className="cta-band">
          <div>
            <h2>Pick a department. Keep the cart short.</h2>
            <p>
              Start with a featured SKU, then add only what the setup needs.
            </p>
          </div>
          <Link href="/shop" className="btn btn-light">
            Browse {brand.name}
          </Link>
        </div>
      </div>
    </>
  );
}
