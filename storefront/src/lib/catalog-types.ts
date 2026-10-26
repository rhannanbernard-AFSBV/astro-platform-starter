export type CategoryId = string;

export type Category = {
  id: CategoryId;
  label: string;
  blurb: string;
};

export type Product = {
  slug: string;
  name: string;
  category: CategoryId;
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
  /** Shopify Admin / Storefront compatibility fields (optional). */
  vendor?: string;
  sku?: string;
  barcode?: string;
  imageSrc?: string;
  productCategory?: string;
  status?: "active" | "draft" | "archived";
  /** gid://shopify/ProductVariant/... after CSV import — enables Checkout with Shopify. */
  shopifyVariantId?: string;
};

export type Brand = {
  name: string;
  tagline: string;
  url: string;
  supportEmail: string;
};

export type HeroCopy = {
  headline: string;
  subhead: string;
  primaryCta: string;
  secondaryCta: string;
};

export type Catalog = {
  brand: Brand;
  shippingNote: string;
  hero: HeroCopy;
  categories: Category[];
  products: Product[];
};

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

export function emptyProduct(category?: Category): Product {
  const label = category?.label ?? "General";
  const id = category?.id ?? "general";
  return {
    slug: `new-product-${Date.now().toString(36)}`,
    name: "New placeholder product",
    category: id,
    categoryLabel: label,
    tagline: "Short benefit line customers scan first.",
    priceCents: 2900,
    shipsInDays: "8–14 business days",
    weight: "500 g",
    materials: "TBD — update after sample",
    includes: ["Main item"],
    problem: "What pain does this solve?",
    benefit: "What outcome do they get?",
    featured: false,
    accent: "#0d6b5c",
    vendor: "",
    sku: "",
    status: "active",
    shopifyVariantId: "",
  };
}

export function validateCatalog(input: unknown): Catalog {
  if (!input || typeof input !== "object") {
    throw new Error("Catalog must be an object");
  }
  const data = input as Catalog;
  if (!data.brand?.name || !data.brand?.tagline) {
    throw new Error("Brand name and tagline are required");
  }
  if (!Array.isArray(data.categories) || data.categories.length === 0) {
    throw new Error("At least one category is required");
  }
  if (!Array.isArray(data.products)) {
    throw new Error("Products must be an array");
  }
  for (const product of data.products) {
    if (!product.slug || !product.name) {
      throw new Error("Each product needs a slug and name");
    }
    if (!Number.isFinite(product.priceCents) || product.priceCents < 0) {
      throw new Error(`Invalid price for ${product.slug}`);
    }
  }
  const featuredCount = data.products.filter((p) => p.featured).length;
  if (featuredCount > 1) {
    throw new Error("Only one product can be marked featured");
  }
  return {
    brand: {
      name: String(data.brand.name),
      tagline: String(data.brand.tagline),
      url: String(data.brand.url || ""),
      supportEmail: String(data.brand.supportEmail || ""),
    },
    shippingNote: String(data.shippingNote || ""),
    hero: {
      headline: String(data.hero?.headline || data.brand.tagline),
      subhead: String(data.hero?.subhead || ""),
      primaryCta: String(data.hero?.primaryCta || "Shop all departments"),
      secondaryCta: String(data.hero?.secondaryCta || "See featured product"),
    },
    categories: data.categories.map((c) => ({
      id: String(c.id),
      label: String(c.label),
      blurb: String(c.blurb || ""),
    })),
    products: data.products.map((p) => ({
      ...p,
      slug: String(p.slug),
      name: String(p.name),
      category: String(p.category),
      categoryLabel: String(p.categoryLabel),
      tagline: String(p.tagline || ""),
      priceCents: Math.round(Number(p.priceCents)),
      compareAtCents:
        p.compareAtCents === undefined || p.compareAtCents === null
          ? undefined
          : Math.round(Number(p.compareAtCents)),
      shipsInDays: String(p.shipsInDays || "8–14 business days"),
      weight: String(p.weight || ""),
      materials: String(p.materials || ""),
      includes: Array.isArray(p.includes)
        ? p.includes.map(String)
        : String(p.includes || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
      problem: String(p.problem || ""),
      benefit: String(p.benefit || ""),
      featured: Boolean(p.featured),
      accent: String(p.accent || "#0d6b5c"),
      vendor: p.vendor ? String(p.vendor) : undefined,
      sku: p.sku ? String(p.sku) : undefined,
      barcode: p.barcode ? String(p.barcode) : undefined,
      imageSrc: p.imageSrc ? String(p.imageSrc) : undefined,
      productCategory: p.productCategory
        ? String(p.productCategory)
        : undefined,
      status:
        p.status === "draft" || p.status === "archived" || p.status === "active"
          ? p.status
          : "active",
      shopifyVariantId: p.shopifyVariantId
        ? String(p.shopifyVariantId)
        : undefined,
    })),
  };
}