import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { beginKittlAuthorization } from "@/lib/company/kittl"

export const runtime = "nodejs"

export async function POST() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  try {
    return NextResponse.json(await beginKittlAuthorization())
  } catch {
    return NextResponse.json({ error: "No se pudo iniciar la autorización de Kittl. Comprueba la configuración y el acceso al servidor MCP." }, { status: 503 })
  }
}
