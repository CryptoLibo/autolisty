import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { inspectKittlCatalog } from "@/lib/company/kittl-generation"
import { listKittlTools } from "@/lib/company/kittl"

export const runtime = "nodejs"

export async function GET() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  try {
    const tools = (await listKittlTools()).filter((tool) => ["kittl-list-teams", "kittl-list-media-generation-models", "kittl-get-token-balance", "kittl-generate-media", "kittl-get-media-generation-status"].includes(tool.name))
    return NextResponse.json({ tools, catalog: await inspectKittlCatalog() }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error consultando Kittl" }, { status: 502, headers: { "Cache-Control": "no-store" } })
  }
}
