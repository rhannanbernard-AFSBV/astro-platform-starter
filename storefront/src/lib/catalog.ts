import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { unstable_noStore as noStore } from "next/cache";
import {
  validateCatalog,
  type Catalog,
  type CategoryId,
  type Product,
} from "./catalog-types";

export const CATALOG_PATH = path.join(process.cwd(), "data", "catalog.json");

export function getCatalog(): Catalog {
  noStore();
  const raw = readFileSync(CATALOG_PATH, "utf8");
  return validateCatalog(JSON.parse(raw));
}

export function saveCatalog(catalog: Catalog): Catalog {
  const validated = validateCatalog(catalog);
  writeFileSync(CATALOG_PATH, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
  return validated;
}

export function getProduct(slug: string): Product | undefined {
  return getCatalog().products.find((p) => p.slug === slug);
}

export function productsByCategory(category: CategoryId): Product[] {
  return getCatalog().products.filter((p) => p.category === category);
}

export function getFeaturedProduct(): Product | undefined {
  const { products } = getCatalog();
  return products.find((p) => p.featured) ?? products[0];
}

// Re-export helpers used across the app
export { formatMoney } from "./catalog-types";
export type {
  Brand,
  Catalog,
  Category,
  CategoryId,
  HeroCopy,
  Product,
} from "./catalog-types";
