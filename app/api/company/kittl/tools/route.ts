import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { listKittlTools } from "@/lib/company/kittl"

export const runtime = "nodejs"

export async function GET() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  try {
    return NextResponse.json({ server: "https://mcp.kittl.com/mcp", tools: await listKittlTools() }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No pude enumerar las herramientas de Kittl." }, { status: 502, headers: { "Cache-Control": "no-store" } })
  }
}
