import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { kittlConnectionStatus, listKittlTools } from "@/lib/company/kittl"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  try {
    const status = kittlConnectionStatus()
    if (!status.connected) return NextResponse.json({ ...status, tools: [] })
    return NextResponse.json({ ...status, tools: await listKittlTools() })
  } catch {
    return NextResponse.json({ configured: true, connected: false, tools: [], error: "La sesión de Kittl necesita revisión o nueva autorización." })
  }
}
