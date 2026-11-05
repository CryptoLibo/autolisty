// Sesión del propietario: cookie firmada con HMAC-SHA256 (AUTH_SECRET), sin estado
// en servidor. Usa Web Crypto para funcionar igual en el middleware (proxy.ts) y en las rutas.

export const SESSION_COOKIE = "__Host-autolisty_session"
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

type SessionPayload = { v: 1; sub: "owner"; cid: string; iat: number; exp: number }

const encoder = new TextEncoder()

function base64UrlEncode(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function getSecret(secret = process.env.AUTH_SECRET) {
  const value = (secret || "").trim()
  if (value.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters.")
  return value
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ])
}

export async function createSessionToken(credentialId: string, options: { now?: number; secret?: string } = {}) {
  const now = Math.floor((options.now ?? Date.now()) / 1000)
  const payload: SessionPayload = { v: 1, sub: "owner", cid: credentialId, iat: now, exp: now + SESSION_MAX_AGE_SECONDS }
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)))
  const key = await hmacKey(getSecret(options.secret))
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)))
  return `${body}.${base64UrlEncode(signature)}`
}

export async function verifySessionToken(token: string | undefined | null, options: { now?: number; secret?: string } = {}) {
  if (!token || token.length > 2048) return null
  const [body, signature, extra] = token.split(".")
  if (!body || !signature || extra !== undefined) return null
  try {
    const key = await hmacKey(getSecret(options.secret))
    const valid = await crypto.subtle.verify("HMAC", key, base64UrlDecode(signature), encoder.encode(body))
    if (!valid) return null
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as SessionPayload
    const now = Math.floor((options.now ?? Date.now()) / 1000)
    if (payload.v !== 1 || payload.sub !== "owner" || typeof payload.exp !== "number" || payload.exp <= now) return null
    return payload
  } catch {
    return null
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  }
}
