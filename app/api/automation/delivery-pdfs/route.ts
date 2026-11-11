import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { regenerateDeliveryPdfs } from "@/lib/automation/deliveryLinks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Regenera y sustituye en Etsy el PDF de entrega de todos los listings de Automation.
export async function POST() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  try {
    const results = await regenerateDeliveryPdfs()
    return NextResponse.json({ ok: true, results })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Regeneration failed." }, { status: 500 })
  }
}
