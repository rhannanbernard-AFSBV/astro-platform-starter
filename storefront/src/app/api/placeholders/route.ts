import { NextResponse } from "next/server";
import { getCatalog, saveCatalog } from "@/lib/catalog";
import { validateCatalog } from "@/lib/catalog-types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(getCatalog());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load catalog";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const catalog = validateCatalog(body);
    const saved = saveCatalog(catalog);
    return NextResponse.json(saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save catalog";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
