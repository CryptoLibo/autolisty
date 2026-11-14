import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { AutomationRepository } from "@/lib/automation/repository"

export const runtime = "nodejs"

// «Comprobar ahora» (E6): mira en Etsy en el próximo minuto si ya publicaste los drafts.
export async function POST() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const count = new AutomationRepository().checkReviewNow()
  return NextResponse.json({ ok: true, count })
}
