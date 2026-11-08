import { NextResponse } from "next/server"
import { takePendingNotificationsFor } from "@/lib/notifications/webPush"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// La pide el service worker del móvil al recibir un push. Se identifica con su
// endpoint de push (cabecera), que solo conocen el dispositivo y el servidor.
export async function GET(request: Request) {
  const endpoint = request.headers.get("x-push-endpoint") || ""
  const notifications = endpoint ? takePendingNotificationsFor(endpoint) : null
  if (!notifications) return NextResponse.json({ error: "Unknown device." }, { status: 401 })
  return NextResponse.json({ notifications }, { headers: { "Cache-Control": "no-store" } })
}
