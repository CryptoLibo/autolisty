import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { takePendingNotifications } from "@/lib/notifications/webPush"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// La pide el service worker del móvil al recibir un push.
export async function GET() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  return NextResponse.json({ notifications: takePendingNotifications() }, { headers: { "Cache-Control": "no-store" } })
}
