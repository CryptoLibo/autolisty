import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { PasskeyStore } from "@/lib/auth/passkeys"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Gestión de passkeys (solo con sesión): listar y eliminar.
export async function GET() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const passkeys = new PasskeyStore().list().map(({ id, name, createdAt, lastUsedAt }) => ({ id, name, createdAt, lastUsedAt }))
  return NextResponse.json({ passkeys })
}

export async function DELETE(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null
  const store = new PasskeyStore()
  if (typeof body?.id !== "string" || !store.get(body.id)) {
    return NextResponse.json({ error: "Passkey not found." }, { status: 404 })
  }
  if (store.list().length <= 1) {
    return NextResponse.json({ error: "You cannot delete your last passkey." }, { status: 409 })
  }
  store.remove(body.id)
  return NextResponse.json({ ok: true })
}
