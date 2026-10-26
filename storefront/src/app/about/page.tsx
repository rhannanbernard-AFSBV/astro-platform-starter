import type { Metadata } from "next";
import { BRAND } from "@/lib/products";

export const metadata: Metadata = {
  title: "About",
  description: "Deskora builds calm desk tools for apartment remote workers.",
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
          Deskora is a focused dropshipping brand for people who work from
          small apartments. We sell a short list of desk tools—not a warehouse
          of random gadgets.
        </p>
        <h2>How we buy and ship</h2>
        <p>
          Products start as placeholders. We order samples, check quality and
          real shipping times, then connect a supplier. Until then, checkout is
          a demo so you can walk the store experience.
        </p>
        <h2>Who we serve</h2>
        <p>
          United States customers, priced in USD, with shipping times written
          plainly on every product page.
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
