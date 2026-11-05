import { NextResponse } from "next/server"
import { getPasskeyConfig, PasskeyStore } from "@/lib/auth/passkeys"
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session"
import { verifyRegistration, WebAuthnError } from "@/lib/auth/webauthn"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    challengeId?: unknown
    name?: unknown
    credential?: { response?: { clientDataJSON?: unknown; attestationObject?: unknown } }
  } | null

  const store = new PasskeyStore()
  // El desafío solo existe si /register/options autorizó (sesión o código).
  const challenge = store.consumeChallenge(body?.challengeId, "register")
  if (!challenge) return NextResponse.json({ error: "The request expired. Try again." }, { status: 400 })

  try {
    const config = getPasskeyConfig()
    const result = verifyRegistration({
      clientDataJSON: String(body?.credential?.response?.clientDataJSON || ""),
      attestationObject: String(body?.credential?.response?.attestationObject || ""),
      expected: { challenge, origin: config.origin, rpId: config.rpId },
    })
    if (store.get(result.credentialId)) {
      return NextResponse.json({ error: "This passkey is already registered." }, { status: 409 })
    }
    const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : "Passkey"
    store.add({ id: result.credentialId, publicKey: result.publicKey, signCount: result.signCount, name })

    const response = NextResponse.json({ ok: true })
    response.cookies.set(SESSION_COOKIE, await createSessionToken(result.credentialId), sessionCookieOptions())
    return response
  } catch (error) {
    const message = error instanceof WebAuthnError ? error.message : "Could not register the passkey."
    if (!(error instanceof WebAuthnError)) console.error("Passkey registration failed:", error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
