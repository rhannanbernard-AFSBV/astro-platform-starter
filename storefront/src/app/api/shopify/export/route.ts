import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/catalog";
import { catalogToShopifyCsv, catalogToShopifyJson } from "@/lib/shopify/csv";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const catalog = getCatalog();
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "csv";

  if (format === "json") {
    return NextResponse.json(catalogToShopifyJson(catalog));
  }

  const csv = catalogToShopifyCsv(catalog);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="northlane-shopify-products.csv"',
    },
  });
}
