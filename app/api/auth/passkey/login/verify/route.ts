import { NextResponse } from "next/server"
import { getPasskeyConfig, PasskeyStore } from "@/lib/auth/passkeys"
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session"
import { verifyAuthentication, WebAuthnError } from "@/lib/auth/webauthn"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    challengeId?: unknown
    credential?: {
      id?: unknown
      response?: { clientDataJSON?: unknown; authenticatorData?: unknown; signature?: unknown }
    }
  } | null

  const store = new PasskeyStore()
  const challenge = store.consumeChallenge(body?.challengeId, "login")
  if (!challenge) return NextResponse.json({ error: "The request expired. Try again." }, { status: 400 })

  const passkey = typeof body?.credential?.id === "string" ? store.get(body.credential.id) : null
  if (!passkey) return NextResponse.json({ error: "This passkey is not registered for Autolisty." }, { status: 401 })

  try {
    const config = getPasskeyConfig()
    const { signCount } = verifyAuthentication({
      clientDataJSON: String(body?.credential?.response?.clientDataJSON || ""),
      authenticatorData: String(body?.credential?.response?.authenticatorData || ""),
      signature: String(body?.credential?.response?.signature || ""),
      publicKey: passkey.publicKey,
      storedSignCount: passkey.signCount,
      expected: { challenge, origin: config.origin, rpId: config.rpId },
    })
    store.recordUse(passkey.id, signCount)
    const response = NextResponse.json({ ok: true })
    response.cookies.set(SESSION_COOKIE, await createSessionToken(passkey.id), sessionCookieOptions())
    return response
  } catch (error) {
    if (!(error instanceof WebAuthnError)) console.error("Passkey login failed:", error)
    return NextResponse.json({ error: "Passkey verification failed." }, { status: 401 })
  }
}
