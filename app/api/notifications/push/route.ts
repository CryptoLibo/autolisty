import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { countSubscriptions, deleteSubscription, getVapidKeys, saveSubscription } from "@/lib/notifications/webPush"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Clave pública para suscribirse y número de dispositivos activados.
export async function GET() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  return NextResponse.json({ publicKey: getVapidKeys().publicKey, devices: countSubscriptions() })
}

export async function POST(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const body = (await request.json().catch(() => null)) as { subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } } | null
  const subscription = body?.subscription
  if (
    typeof subscription?.endpoint !== "string" ||
    typeof subscription.keys?.p256dh !== "string" ||
    typeof subscription.keys?.auth !== "string"
  ) {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 })
  }
  try {
    saveSubscription(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } },
      request.headers.get("user-agent")
    )
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid subscription." }, { status: 400 })
  }
  return NextResponse.json({ ok: true, devices: countSubscriptions() })
}

export async function DELETE(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null
  if (typeof body?.endpoint === "string") deleteSubscription(body.endpoint)
  return NextResponse.json({ ok: true, devices: countSubscriptions() })
}
