import { NextResponse } from "next/server"
import { getPasskeyConfig, PasskeyStore } from "@/lib/auth/passkeys"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Desafío para iniciar sesión. Sin lista de credenciales: el dispositivo
// muestra sus passkeys de autolisty.com (Face ID, huella, PIN).
export async function POST() {
  const store = new PasskeyStore()
  if (store.list().length === 0) {
    return NextResponse.json({ error: "No passkey is registered yet. Use your setup code first." }, { status: 409 })
  }
  const config = getPasskeyConfig()
  const { id, challenge } = store.createChallenge("login")
  return NextResponse.json({
    challengeId: id,
    publicKey: { challenge, rpId: config.rpId, timeout: 120000, userVerification: "required", allowCredentials: [] },
  })
}
