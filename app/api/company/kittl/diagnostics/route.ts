import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { inspectKittlCatalog } from "@/lib/company/kittl-generation"
import { listKittlTools } from "@/lib/company/kittl"

export const runtime = "nodejs"

export async function GET() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  try {
    const tools = await listKittlTools()
    const catalog = await inspectKittlCatalog().catch((error: unknown) => ({ error: error instanceof Error ? error.message : "Error consultando el catálogo" }))
    return NextResponse.json({ tools, catalog }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error consultando Kittl" }, { status: 502, headers: { "Cache-Control": "no-store" } })
  }
}
