import type { Metadata } from "next";
import { BRAND, CATEGORIES } from "@/lib/products";

export const metadata: Metadata = {
  title: "About",
  description:
    "Northlane is a multi-niche dropshipping brand for home, style, pets, and play.",
};

export default function AboutPage() {
  return (
    <div className="container">
      <header className="page-hero">
        <p className="eyebrow">About</p>
        <h1>{BRAND.name}</h1>
        <p>{BRAND.tagline}</p>
      </header>
      <div className="prose">
        <p>
          Northlane is a US-focused dropshipping brand across eight departments:
          bed, bath, kitchens, home decor, jewelry, women&apos;s fashion, pet
          accessories, and video games.
        </p>
        <h2>Departments</h2>
        <ul>
          {CATEGORIES.map((cat) => (
            <li key={cat.id}>
              <strong>{cat.label}</strong> — {cat.blurb}
            </li>
          ))}
        </ul>
        <h2>How we buy and ship</h2>
        <p>
          Products start as placeholders. We order samples, check quality and
          real shipping times, then connect a supplier. Until then, checkout is
          a demo so you can walk the store experience.
        </p>
        <h2>Contact</h2>
        <p>
          Email{" "}
          <a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a> for
          product questions.
        </p>
      </div>
    </div>
  );
}
