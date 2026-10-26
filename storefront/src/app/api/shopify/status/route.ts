import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/catalog";
import { shopifyStatus } from "@/lib/shopify/storefront";

export const dynamic = "force-dynamic";

export async function GET() {
  const catalog = getCatalog();
  const status = shopifyStatus();
  const linked = catalog.products.filter((p) => p.shopifyVariantId).length;
  return NextResponse.json({
    ...status,
    productsTotal: catalog.products.length,
    productsWithVariantId: linked,
    checkoutReady: status.enabled && linked > 0,
    exportCsv: "/api/shopify/export?format=csv",
    exportJson: "/api/shopify/export?format=json",
  });
}
