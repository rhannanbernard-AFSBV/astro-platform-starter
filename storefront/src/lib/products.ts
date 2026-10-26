export type Product = {
  slug: string;
  name: string;
  tagline: string;
  priceCents: number;
  compareAtCents?: number;
  shipsInDays: string;
  weight: string;
  materials: string;
  includes: string[];
  problem: string;
  benefit: string;
  featured?: boolean;
  accent: string;
};

/** Placeholder catalog until a supplier is selected and samples arrive. */
export const PRODUCTS: Product[] = [
  {
    slug: "cable-harbor",
    name: "Cable Harbor",
    tagline: "Dock power, USB-C, and headphones in one calm strip.",
    priceCents: 3900,
    compareAtCents: 4900,
    shipsInDays: "8–14 business days",
    weight: "420 g",
    materials: "Anodized aluminum, silicone cable guides",
    includes: ["Harbor base", "Two silicone guides", "Felt pad kit"],
    problem: "Cables tangle at the edge of a small desk.",
    benefit: "One place for every cord you touch daily.",
    featured: true,
    accent: "#0d6b5c",
  },
  {
    slug: "lift-riser",
    name: "Lift Riser",
    tagline: "Raise your screen to eye level without a bulky stand.",
    priceCents: 5400,
    shipsInDays: "8–14 business days",
    weight: "1.1 kg",
    materials: "Solid ash, non-slip feet",
    includes: ["Riser shelf", "Felt feet", "Cable pass-through"],
    problem: "Laptop screens sit too low on apartment desks.",
    benefit: "Straighter posture in a footprint under 12 inches.",
    accent: "#1f4b63",
  },
  {
    slug: "softfocus-mat",
    name: "SoftFocus Mat",
    tagline: "A quiet desk surface that stops the visual noise.",
    priceCents: 4200,
    shipsInDays: "8–14 business days",
    weight: "680 g",
    materials: "Natural rubber base, woven polyester top",
    includes: ["Desk mat 31×15 in", "Care card"],
    problem: "Glossy desks glare and feel cold for long sessions.",
    benefit: "A defined work zone that feels finished, not temporary.",
    accent: "#3d4a3a",
  },
  {
    slug: "angle-lamp",
    name: "Angle Lamp",
    tagline: "Warm task light that stays out of your camera frame.",
    priceCents: 6900,
    compareAtCents: 7900,
    shipsInDays: "10–16 business days",
    weight: "950 g",
    materials: "Powder-coated steel, frosted diffuser",
    includes: ["Lamp body", "USB-C cable", "Dimmer dial"],
    problem: "Overhead lights wash out video calls and tire eyes.",
    benefit: "Focused light for work without lighting the whole room.",
    accent: "#8a6a2f",
  },
  {
    slug: "fold-laptop-stand",
    name: "Fold Stand",
    tagline: "A travel-ready laptop stand that disappears in a bag.",
    priceCents: 3600,
    shipsInDays: "8–14 business days",
    weight: "280 g",
    materials: "Aircraft-grade aluminum",
    includes: ["Foldable stand", "Carry sleeve"],
    problem: "Hotel and café tables put your screen too low.",
    benefit: "Better posture anywhere you open the laptop.",
    accent: "#2c3e50",
  },
  {
    slug: "quiet-hook",
    name: "Quiet Hook",
    tagline: "Hang headphones off the desk edge—no clamp marks.",
    priceCents: 2400,
    shipsInDays: "8–12 business days",
    weight: "110 g",
    materials: "Silicone-lined steel",
    includes: ["Hook", "Felt protectors"],
    problem: "Headphones eat desk space or fall to the floor.",
    benefit: "One calm place for gear between calls.",
    accent: "#4a5d4e",
  },
  {
    slug: "pocket-tray",
    name: "Pocket Tray",
    tagline: "Catch keys, AirPods, and pens before they scatter.",
    priceCents: 2800,
    shipsInDays: "8–14 business days",
    weight: "310 g",
    materials: "Cast concrete composite",
    includes: ["Tray", "Cork base"],
    problem: "Small items migrate into every drawer.",
    benefit: "A single landing spot next to your keyboard.",
    accent: "#5c4f3a",
  },
  {
    slug: "focus-cube",
    name: "Focus Cube",
    tagline: "A physical timer that keeps phones out of the loop.",
    priceCents: 3200,
    shipsInDays: "8–14 business days",
    weight: "190 g",
    materials: "Beech wood, silent flip mechanism",
    includes: ["Cube timer", "Quick-start guide"],
    problem: "Phone timers pull you back into notifications.",
    benefit: "Start a focus block with a flip—no screen required.",
    accent: "#0d6b5c",
  },
];

export function getProduct(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export const SHIPPING_NOTE =
  "Ships from our fulfillment partner in 8–14 business days to addresses in the United States. Tracking is emailed when the package leaves the warehouse.";

export const BRAND = {
  name: "Deskora",
  tagline: "Calm tools for apartment desks.",
  url: "https://deskora.example",
  supportEmail: "hello@deskora.example",
};