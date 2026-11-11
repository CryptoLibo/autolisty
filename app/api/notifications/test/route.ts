import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { notifyOwner } from "@/lib/notifications/webPush"

export const runtime = "nodejs"

export async function POST() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  await notifyOwner({ title: "Autolisty", body: "Las notificaciones funcionan en este dispositivo.", url: "/?section=automation", tag: "test" })
  return NextResponse.json({ ok: true })
}
