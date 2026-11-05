import { NextResponse } from "next/server"
import { getPasskeyConfig, isValidSetupCode, PasskeyStore } from "@/lib/auth/passkeys"
import { getOwnerSession } from "@/lib/auth/ownerSession"
import { toBase64Url } from "@/lib/auth/webauthn"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Opciones para registrar un passkey en este dispositivo.
// Requiere sesión iniciada, o el código de configuración (primer dispositivo / recuperación).
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { setupCode?: unknown } | null
  const session = await getOwnerSession()
  if (!session && !isValidSetupCode(body?.setupCode)) {
    return NextResponse.json({ error: "Sign in or enter a valid setup code to add a device." }, { status: 401 })
  }

  const config = getPasskeyConfig()
  const store = new PasskeyStore()
  const { id, challenge } = store.createChallenge("register")
  return NextResponse.json({
    challengeId: id,
    publicKey: {
      rp: { id: config.rpId, name: config.rpName },
      user: { id: toBase64Url(Buffer.from("autolisty-owner")), name: "owner", displayName: "Autolisty owner" },
      challenge,
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -8 },
        { type: "public-key", alg: -257 },
      ],
      timeout: 120000,
      attestation: "none",
      authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
      excludeCredentials: store.list().map((passkey) => ({ type: "public-key", id: passkey.id })),
    },
  })
}
