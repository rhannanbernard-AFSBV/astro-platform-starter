import Link from "next/link";
import { AddToCartButton } from "@/components/AddToCartButton";
import { ProductTile } from "@/components/ProductTile";
import {
  BRAND,
  CATEGORIES,
  PRODUCTS,
  SHIPPING_NOTE,
  formatMoney,
  getProduct,
} from "@/lib/products";

export default function HomePage() {
  const featured = getProduct("cloudrest-sheet-set")!;
  const grid = PRODUCTS.filter((p) => p.slug !== featured.slug);

  return (
    <>
      <section className="hero" aria-label="Hero">
        <div className="hero__media" aria-hidden="true" />
        <div className="container hero__content">
          <p className="eyebrow">{BRAND.name}</p>
          <h1>Home, style, pets, and play.</h1>
          <p>
            Eight focused departments—bed, bath, kitchens, decor, jewelry,
            women&apos;s fashion, pet accessories, and video games—with shipping
            times stated up front.
          </p>
          <div className="hero__actions">
            <Link href="/shop" className="btn btn-light">
              Shop all departments
            </Link>
            <Link
              href="/product/cloudrest-sheet-set"
              className="btn btn-ghost"
              style={{ color: "#f4faf8", borderColor: "rgba(244,250,248,0.35)" }}
            >
              Start with Cloudrest sheets
            </Link>
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
              SKUs.
            </p>
          </div>
          <div className="category-grid">
            {CATEGORIES.map((cat) => (
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
              Mega-stores bury good products under endless tabs. Northlane keeps
              eight niches, honest shipping, and a short list of placeholders
              until samples clear.
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
              <li>Bed, bath, kitchen, and decor for the home.</li>
              <li>Jewelry and women&apos;s fashion for everyday style.</li>
              <li>Pet accessories and video-game gear for the rest of life.</li>
              <li>8–14 business day shipping shown on every product.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section__head">
            <p className="eyebrow">Featured · Bed</p>
            <h2>Start with Cloudrest sheets.</h2>
            <p>
              Soft, breathable bedding for hot sleepers—our first bed department
              placeholder.
            </p>
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
              <p className="ship-note">{SHIPPING_NOTE}</p>
              <div className="hero__actions">
                <AddToCartButton
                  slug={featured.slug}
                  label="Add Cloudrest sheets"
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

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section__head">
            <p className="eyebrow">Across the store</p>
            <h2>One pick from each department.</h2>
            <p>
              Placeholder products with realistic US pricing until supplier
              samples are approved.
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
              <p>
                We show 8–14 business days on every product page. No surprise
                three-week waits after checkout.
              </p>
            </div>
            <div className="trust-item">
              <h3>US customers first</h3>
              <p>
                Prices in USD. Checkout and support copy written for United
                States delivery addresses.
              </p>
            </div>
            <div className="trust-item">
              <h3>Samples before scale</h3>
              <p>
                Catalog items are placeholders until we order samples and lock a
                supplier. Quality checks come before ad spend.
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
              Start with bed, then add bath, kitchen, style, pets, or play—only
              what you need.
            </p>
          </div>
          <Link href="/shop" className="btn btn-light">
            Browse Northlane
          </Link>
        </div>
      </div>
    </>
  );
}