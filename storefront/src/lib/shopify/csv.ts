import type { Catalog, Product } from "@/lib/catalog-types";

/** Shopify Admin product CSV columns used for Products → Import. */
export const SHOPIFY_CSV_HEADERS = [
  "Handle",
  "Title",
  "Body (HTML)",
  "Vendor",
  "Product Category",
  "Type",
  "Tags",
  "Published",
  "Option1 Name",
  "Option1 Value",
  "Variant SKU",
  "Variant Grams",
  "Variant Inventory Tracker",
  "Variant Inventory Qty",
  "Variant Inventory Policy",
  "Variant Fulfillment Service",
  "Variant Price",
  "Variant Compare At Price",
  "Variant Requires Shipping",
  "Variant Taxable",
  "Variant Barcode",
  "Image Src",
  "Image Position",
  "Image Alt Text",
  "Gift Card",
  "SEO Title",
  "SEO Description",
  "Status",
] as const;

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function productBodyHtml(product: Product, shippingNote: string): string {
  const includes = product.includes.map((item) => `<li>${item}</li>`).join("");
  return [
    `<p>${product.tagline}</p>`,
    `<p><strong>Benefit:</strong> ${product.benefit}</p>`,
    `<p><strong>Problem:</strong> ${product.problem}</p>`,
    `<p><strong>Materials:</strong> ${product.materials}</p>`,
    `<p><strong>Weight:</strong> ${product.weight}</p>`,
    `<p><strong>Ships in:</strong> ${product.shipsInDays}</p>`,
    includes ? `<p><strong>Includes:</strong></p><ul>${includes}</ul>` : "",
    `<p>${shippingNote}</p>`,
  ]
    .filter(Boolean)
    .join("");
}

function gramsFromWeight(weight: string): string {
  const match = weight.match(/([\d.]+)\s*(kg|g|lb|oz)?/i);
  if (!match) return "0";
  const amount = Number.parseFloat(match[1]);
  const unit = (match[2] || "g").toLowerCase();
  if (!Number.isFinite(amount)) return "0";
  if (unit === "kg") return String(Math.round(amount * 1000));
  if (unit === "lb") return String(Math.round(amount * 453.592));
  if (unit === "oz") return String(Math.round(amount * 28.3495));
  return String(Math.round(amount));
}

export function productToShopifyRow(
  product: Product,
  catalog: Catalog,
): Record<(typeof SHOPIFY_CSV_HEADERS)[number], string> {
  const vendor = product.vendor || catalog.brand.name;
  const price = (product.priceCents / 100).toFixed(2);
  const compare =
    product.compareAtCents !== undefined
      ? (product.compareAtCents / 100).toFixed(2)
      : "";
  const tags = [
    product.categoryLabel,
    product.featured ? "featured" : "",
    "northlane",
    "placeholder",
  ]
    .filter(Boolean)
    .join(", ");

  return {
    Handle: product.slug,
    Title: product.name,
    "Body (HTML)": productBodyHtml(product, catalog.shippingNote),
    Vendor: vendor,
    "Product Category": product.productCategory || "",
    Type: product.categoryLabel,
    Tags: tags,
    Published: "true",
    "Option1 Name": "Title",
    "Option1 Value": "Default Title",
    "Variant SKU": product.sku || product.slug.toUpperCase(),
    "Variant Grams": gramsFromWeight(product.weight),
    "Variant Inventory Tracker": "",
    "Variant Inventory Qty": "",
    "Variant Inventory Policy": "deny",
    "Variant Fulfillment Service": "manual",
    "Variant Price": price,
    "Variant Compare At Price": compare,
    "Variant Requires Shipping": "true",
    "Variant Taxable": "true",
    "Variant Barcode": product.barcode || "",
    "Image Src": product.imageSrc || "",
    "Image Position": product.imageSrc ? "1" : "",
    "Image Alt Text": product.imageSrc ? product.name : "",
    "Gift Card": "false",
    "SEO Title": `${product.name} | ${catalog.brand.name}`,
    "SEO Description": product.tagline.slice(0, 320),
    Status: product.status || "active",
  };
}

export function catalogToShopifyCsv(catalog: Catalog): string {
  const lines = [SHOPIFY_CSV_HEADERS.join(",")];
  for (const product of catalog.products) {
    const row = productToShopifyRow(product, catalog);
    lines.push(
      SHOPIFY_CSV_HEADERS.map((header) => escapeCsv(row[header] ?? "")).join(
        ",",
      ),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function catalogToShopifyJson(catalog: Catalog) {
  return {
    generatedAt: new Date().toISOString(),
    shopifyImport: {
      format: "products-csv",
      adminPath: "Products → Import",
      notes: [
        "Import shopify/export/products.csv in Shopify Admin.",
        "After import, copy each variant GID into catalog product.shopifyVariantId for headless checkout.",
        "Set SHOPIFY_STORE_DOMAIN and SHOPIFY_STOREFRONT_TOKEN to enable Checkout with Shopify.",
      ],
    },
    brand: catalog.brand,
    products: catalog.products.map((product) => ({
      handle: product.slug,
      title: product.name,
      vendor: product.vendor || catalog.brand.name,
      productType: product.categoryLabel,
      tags: [product.categoryLabel, product.featured ? "featured" : null].filter(
        Boolean,
      ),
      status: product.status || "active",
      sku: product.sku || product.slug.toUpperCase(),
      price: Number((product.priceCents / 100).toFixed(2)),
      compareAtPrice:
        product.compareAtCents !== undefined
          ? Number((product.compareAtCents / 100).toFixed(2))
          : null,
      grams: Number(gramsFromWeight(product.weight)),
      shopifyVariantId: product.shopifyVariantId || null,
      imageSrc: product.imageSrc || null,
    })),
  };
}
