import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { kittlOptions } from "@/lib/company/kittl-generation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  try { return NextResponse.json(await kittlOptions()) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Kittl no está disponible." }, { status: 503 }) }
}
