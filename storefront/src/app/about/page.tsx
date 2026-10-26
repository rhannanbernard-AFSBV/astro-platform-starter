import type { Metadata } from "next";
import { getCatalog } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "About",
};

export default function AboutPage() {
  const { brand, categories } = getCatalog();

  return (
    <div className="container">
      <header className="page-hero">
        <p className="eyebrow">About</p>
        <h1>{brand.name}</h1>
        <p>{brand.tagline}</p>
      </header>
      <div className="prose">
        <p>
          {brand.name} is a US-focused dropshipping brand. Departments and
          placeholder products are editable at{" "}
          <a href="/placeholders">/placeholders</a> or in{" "}
          <code>storefront/data/catalog.json</code>.
        </p>
        <h2>Departments</h2>
        <ul>
          {categories.map((cat) => (
            <li key={cat.id}>
              <strong>{cat.label}</strong> — {cat.blurb}
            </li>
          ))}
        </ul>
        <h2>Contact</h2>
        <p>
          Email{" "}
          <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.
        </p>
      </div>
    </div>
  );
}
