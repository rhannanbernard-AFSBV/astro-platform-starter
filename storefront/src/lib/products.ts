export type Category =
  | "bed"
  | "bath"
  | "kitchens"
  | "home-decor"
  | "jewelry"
  | "womens-fashion"
  | "pets"
  | "video-games";

export type Product = {
  slug: string;
  name: string;
  category: Category;
  categoryLabel: string;
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

export const CATEGORIES: { id: Category; label: string; blurb: string }[] = [
  { id: "bed", label: "Bed", blurb: "Softer nights, cleaner rest." },
  { id: "bath", label: "Bath", blurb: "Rituals that feel like a hotel." },
  { id: "kitchens", label: "Kitchens", blurb: "Tools that earn counter space." },
  { id: "home-decor", label: "Home decor", blurb: "Finish the room, not the cart." },
  { id: "jewelry", label: "Jewelry", blurb: "Everyday pieces with quiet shine." },
  { id: "womens-fashion", label: "Women's fashion", blurb: "Layers you actually reach for." },
  { id: "pets", label: "Pet accessories", blurb: "Gear your pet will use daily." },
  { id: "video-games", label: "Video games", blurb: "Play setups that stay tidy." },
];

/** Placeholder catalog until a supplier is selected and samples arrive. */
export const PRODUCTS: Product[] = [
  {
    slug: "cloudrest-sheet-set",
    name: "Cloudrest Sheet Set",
    category: "bed",
    categoryLabel: "Bed",
    tagline: "Breathable queen sheets that stay cool through the night.",
    priceCents: 5900,
    compareAtCents: 7900,
    shipsInDays: "8–14 business days",
    weight: "1.4 kg",
    materials: "Washed microfiber, deep-pocket fitted sheet",
    includes: ["Fitted sheet", "Flat sheet", "2 pillowcases"],
    problem: "Hot sleepers wake up tangled in stiff hotel-style sheets.",
    benefit: "A softer bed that feels finished without a full bedding overhaul.",
    featured: true,
    accent: "#3d5a6c",
  },
  {
    slug: "mistline-towel-set",
    name: "Mistline Towel Set",
    category: "bath",
    categoryLabel: "Bath",
    tagline: "Thick bath towels that dry fast and stay lofted.",
    priceCents: 4800,
    shipsInDays: "8–14 business days",
    weight: "1.8 kg",
    materials: "Combed cotton terry",
    includes: ["2 bath towels", "2 hand towels", "2 washcloths"],
    problem: "Thin towels go flat after a few washes.",
    benefit: "A spa-weight set that still ships light enough for dropshipping.",
    accent: "#2f6f6a",
  },
  {
    slug: "hearth-pan-set",
    name: "Hearth Nonstick Pan Set",
    category: "kitchens",
    categoryLabel: "Kitchens",
    tagline: "Three pans that cover weeknight cooking without the clutter.",
    priceCents: 7200,
    compareAtCents: 8900,
    shipsInDays: "10–16 business days",
    weight: "3.2 kg",
    materials: "Aluminum body, PFOA-free coating, stay-cool handles",
    includes: ["8 in skillet", "10 in skillet", "2.5 qt saucepan", "Lids"],
    problem: "Starter kitchens collect mismatched pans that stick.",
    benefit: "One set for eggs, sauces, and sears—then stop shopping pans.",
    accent: "#6b4f3a",
  },
  {
    slug: "linen-arc-vase",
    name: "Linen Arc Vase",
    category: "home-decor",
    categoryLabel: "Home decor",
    tagline: "A matte ceramic vase that anchors a shelf or table.",
    priceCents: 3400,
    shipsInDays: "8–14 business days",
    weight: "900 g",
    materials: "Stoneware ceramic, matte glaze",
    includes: ["Vase", "Care card"],
    problem: "Empty shelves make a room feel temporary.",
    benefit: "One sculptural piece that photographs well and ships safely packed.",
    accent: "#5a6b52",
  },
  {
    slug: "aurora-hoop-set",
    name: "Aurora Hoop Set",
    category: "jewelry",
    categoryLabel: "Jewelry",
    tagline: "Lightweight gold-tone hoops for everyday wear.",
    priceCents: 2800,
    shipsInDays: "8–12 business days",
    weight: "45 g",
    materials: "Gold-plated brass, hypoallergenic posts",
    includes: ["Pair of hoops", "Velvet pouch", "Polish cloth"],
    problem: "Statement jewelry sits unworn while basics go missing.",
    benefit: "A daily pair that layers with anything in the cart.",
    accent: "#8a6a2f",
  },
  {
    slug: "softline-wrap-cardigan",
    name: "Softline Wrap Cardigan",
    category: "womens-fashion",
    categoryLabel: "Women's fashion",
    tagline: "A mid-weight wrap for cool offices and weekend errands.",
    priceCents: 5400,
    compareAtCents: 6800,
    shipsInDays: "8–14 business days",
    weight: "480 g",
    materials: "Cotton-blend knit",
    includes: ["Cardigan", "Care label"],
    problem: "Thin tops need a layer that still looks put-together.",
    benefit: "One flattering wrap that works with jeans or a dress.",
    accent: "#6b3f4e",
  },
  {
    slug: "trailpaw-travel-kit",
    name: "Trailpaw Travel Kit",
    category: "pets",
    categoryLabel: "Pet accessories",
    tagline: "Collapsible bowl, treat pouch, and leash clip for walks.",
    priceCents: 3200,
    shipsInDays: "8–14 business days",
    weight: "350 g",
    materials: "Food-grade silicone, nylon webbing",
    includes: ["Collapsible bowl", "Treat pouch", "Carabiner clip"],
    problem: "Walks turn into juggling water bottles and loose treats.",
    benefit: "One grab-and-go kit for dogs on the move.",
    accent: "#3f5c45",
  },
  {
    slug: "pixelrest-controller-stand",
    name: "Pixelrest Controller Stand",
    category: "video-games",
    categoryLabel: "Video games",
    tagline: "A dual stand that keeps controllers charged and off the floor.",
    priceCents: 3600,
    shipsInDays: "8–14 business days",
    weight: "620 g",
    materials: "ABS shell, USB-C charge docks",
    includes: ["Stand", "USB-C cable", "Non-slip feet"],
    problem: "Controllers vanish into the couch between sessions.",
    benefit: "A clean play station that looks intentional on camera.",
    accent: "#2c3e70",
  },
];

export function getProduct(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}

export function productsByCategory(category: Category): Product[] {
  return PRODUCTS.filter((p) => p.category === category);
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
  name: "Northlane",
  tagline: "Home, style, pets, and play—shipped across the US.",
  url: "https://northlane.example",
  supportEmail: "hello@northlane.example",
};
