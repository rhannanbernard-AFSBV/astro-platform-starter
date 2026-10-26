import Link from "next/link";
import { AddToCartButton } from "@/components/AddToCartButton";
import { ProductTile } from "@/components/ProductTile";
import {
  BRAND,
  PRODUCTS,
  SHIPPING_NOTE,
  formatMoney,
  getProduct,
} from "@/lib/products";

export default function HomePage() {
  const featured = getProduct("cable-harbor")!;
  const grid = PRODUCTS.filter((p) => p.slug !== featured.slug).slice(0, 6);

  return (
    <>
      <section className="hero" aria-label="Hero">
        <div className="hero__media" aria-hidden="true" />
        <div className="container hero__content">
          <p className="eyebrow">{BRAND.name}</p>
          <h1>Calm tools for apartment desks.</h1>
          <p>
            Compact desk gear for remote workers who share a small space—and
            still want a setup that feels finished.
          </p>
          <div className="hero__actions">
            <Link href="/product/cable-harbor" className="btn btn-light">
              Shop Cable Harbor
            </Link>
            <Link href="/shop" className="btn btn-ghost" style={{ color: "#f4faf8", borderColor: "rgba(244,250,248,0.35)" }}>
              Browse the desk kit
            </Link>
          </div>
        </div>
      </section>

      <section className="section" id="why">
        <div className="container split">
          <div className="problem-panel">
            <p className="eyebrow" style={{ color: "#7dbea8" }}>
              The problem
            </p>
            <h3>Small desks collect chaos fast.</h3>
            <p>
              Cables, headphones, and glare turn a kitchen table into a
              temporary office. Deskora is a short list of tools that reclaim
              that surface—without filling a closet.
            </p>
          </div>
          <div>
            <p className="eyebrow">What changes</p>
            <h2 style={{ fontSize: "clamp(1.8rem, 3vw, 2.4rem)", margin: "0.4rem 0 1rem" }}>
              One clear work zone.
            </h2>
            <ul className="checklist">
              <li>Every daily cable lands in one dock—not over the edge.</li>
              <li>Screen height and task light stay camera-friendly.</li>
              <li>Shipping time is stated up front: 8–14 business days to the US.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section__head">
            <p className="eyebrow">Featured</p>
            <h2>Start with Cable Harbor.</h2>
            <p>
              The first piece most apartment desks need: a single strip for
              power, USB-C, and headphones.
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
                  <span className="was">{formatMoney(featured.compareAtCents)}</span>
                ) : null}
              </div>
              <p className="ship-note">{SHIPPING_NOTE}</p>
              <div className="hero__actions">
                <AddToCartButton slug={featured.slug} label="Add Cable Harbor" />
                <Link href={`/product/${featured.slug}`} className="btn btn-ghost">
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
            <p className="eyebrow">The desk kit</p>
            <h2>Eight pieces. No filler aisle.</h2>
            <p>
              Placeholder products with realistic prices until supplier samples
              are approved.
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
            <h2>Clear the edge of your desk.</h2>
            <p>
              Start with Cable Harbor, then add the pieces your setup actually
              needs—nothing more.
            </p>
          </div>
          <Link href="/product/cable-harbor" className="btn btn-light">
            Get Cable Harbor
          </Link>
        </div>
      </div>
    </>
  );
}
