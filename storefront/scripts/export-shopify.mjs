#!/usr/bin/env node
/**
 * Writes Shopify Admin import artifacts used by `npm run build`.
 * Output: shopify/export/products.csv + products.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const catalogPath = path.join(root, "data", "catalog.json");
const outDir = path.join(root, "shopify", "export");

const HEADERS = [
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
];

function escapeCsv(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function gramsFromWeight(weight) {
  const match = String(weight || "").match(/([\d.]+)\s*(kg|g|lb|oz)?/i);
  if (!match) return "0";
  const amount = Number.parseFloat(match[1]);
  const unit = (match[2] || "g").toLowerCase();
  if (!Number.isFinite(amount)) return "0";
  if (unit === "kg") return String(Math.round(amount * 1000));
  if (unit === "lb") return String(Math.round(amount * 453.592));
  if (unit === "oz") return String(Math.round(amount * 28.3495));
  return String(Math.round(amount));
}

function bodyHtml(product, shippingNote) {
  const includes = (product.includes || [])
    .map((item) => `<li>${item}</li>`)
    .join("");
  return [
    `<p>${product.tagline || ""}</p>`,
    `<p><strong>Benefit:</strong> ${product.benefit || ""}</p>`,
    `<p><strong>Problem:</strong> ${product.problem || ""}</p>`,
    `<p><strong>Materials:</strong> ${product.materials || ""}</p>`,
    `<p><strong>Weight:</strong> ${product.weight || ""}</p>`,
    `<p><strong>Ships in:</strong> ${product.shipsInDays || ""}</p>`,
    includes ? `<p><strong>Includes:</strong></p><ul>${includes}</ul>` : "",
    `<p>${shippingNote || ""}</p>`,
  ]
    .filter(Boolean)
    .join("");
}

function toRow(product, catalog) {
  const vendor = product.vendor || catalog.brand.name;
  const price = (Number(product.priceCents) / 100).toFixed(2);
  const compare =
    product.compareAtCents !== undefined && product.compareAtCents !== null
      ? (Number(product.compareAtCents) / 100).toFixed(2)
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
    "Body (HTML)": bodyHtml(product, catalog.shippingNote),
    Vendor: vendor,
    "Product Category": product.productCategory || "",
    Type: product.categoryLabel,
    Tags: tags,
    Published: "true",
    "Option1 Name": "Title",
    "Option1 Value": "Default Title",
    "Variant SKU": product.sku || String(product.slug).toUpperCase(),
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
    "SEO Description": String(product.tagline || "").slice(0, 320),
    Status: product.status || "active",
  };
}

const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
if (!catalog?.products?.length) {
  console.error("No products found in data/catalog.json");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const csvLines = [HEADERS.join(",")];
for (const product of catalog.products) {
  const row = toRow(product, catalog);
  csvLines.push(HEADERS.map((h) => escapeCsv(row[h])).join(","));
}
const csvPath = path.join(outDir, "products.csv");
writeFileSync(csvPath, `${csvLines.join("\n")}\n`, "utf8");

const json = {
  generatedAt: new Date().toISOString(),
  shopifyImport: {
    format: "products-csv",
    adminPath: "Products → Import",
    file: "products.csv",
  },
  brand: catalog.brand,
  products: catalog.products.map((product) => ({
    handle: product.slug,
    title: product.name,
    vendor: product.vendor || catalog.brand.name,
    productType: product.categoryLabel,
    sku: product.sku || String(product.slug).toUpperCase(),
    price: Number((Number(product.priceCents) / 100).toFixed(2)),
    compareAtPrice:
      product.compareAtCents !== undefined && product.compareAtCents !== null
        ? Number((Number(product.compareAtCents) / 100).toFixed(2))
        : null,
    grams: Number(gramsFromWeight(product.weight)),
    shopifyVariantId: product.shopifyVariantId || null,
    imageSrc: product.imageSrc || null,
    status: product.status || "active",
  })),
};
const jsonPath = path.join(outDir, "products.json");
writeFileSync(jsonPath, `${JSON.stringify(json, null, 2)}\n`, "utf8");

console.log(
  `Shopify export: ${catalog.products.length} products → ${path.relative(root, csvPath)}`,
);
