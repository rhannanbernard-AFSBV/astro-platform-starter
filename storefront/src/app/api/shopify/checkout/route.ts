import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/catalog";
import { createShopifyCheckout, shopifyStatus } from "@/lib/shopify/storefront";

export const dynamic = "force-dynamic";

type Body = {
  lines?: { slug: string; qty: number }[];
};

export async function POST(request: Request) {
  try {
    const status = shopifyStatus();
    if (!status.enabled) {
      return NextResponse.json(
        {
          error:
            "Shopify Storefront is not configured. Set SHOPIFY_STORE_DOMAIN and SHOPIFY_STOREFRONT_TOKEN.",
        },
        { status: 400 },
      );
    }

    const body = (await request.json()) as Body;
    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (!lines.length) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    const catalog = getCatalog();
    const merchandise = lines.map((line) => {
      const product = catalog.products.find((p) => p.slug === line.slug);
      if (!product) {
        throw new Error(`Unknown product: ${line.slug}`);
      }
      if (!product.shopifyVariantId) {
        throw new Error(
          `${product.name} is missing shopifyVariantId. Import the CSV into Shopify, then paste the variant GID into Edit placeholders.`,
        );
      }
      return {
        merchandiseId: product.shopifyVariantId,
        quantity: Math.max(1, Math.round(Number(line.qty) || 1)),
      };
    });

    const result = await createShopifyCheckout(merchandise);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Shopify checkout failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
