import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { clearToken } from "@/lib/integrations/tokenSession"

export const runtime = "nodejs"

export async function POST() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized

  await clearToken("etsy")

  return NextResponse.json({ ok: true })
}
