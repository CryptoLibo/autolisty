const SESSION_COOKIE = "autolisty_session"
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7

type SessionPayload = {
  username: string
  exp: number
}

function getRequiredEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}

function encodeJson(value: unknown) {
  const json = JSON.stringify(value)
  return bytesToBase64Url(new TextEncoder().encode(json))
}

function decodeJson<T>(value: string): T {
  const json = new TextDecoder().decode(base64UrlToBytes(value))
  return JSON.parse(json) as T
}

async function signValue(value: string) {
  const secret = getRequiredEnv("APP_SESSION_SECRET")
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))
  return bytesToBase64Url(new Uint8Array(signature))
}

export function getSessionCookieName() {
  return SESSION_COOKIE
}

export function getSessionDurationSeconds() {
  return SESSION_DURATION_SECONDS
}

export function getConfiguredUsername() {
  return getRequiredEnv("APP_LOGIN_USERNAME")
}

export function getConfiguredPassword() {
  return getRequiredEnv("APP_LOGIN_PASSWORD")
}

export async function createSessionToken(username: string) {
  const payload: SessionPayload = {
    username,
    exp: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
  }

  const encodedPayload = encodeJson(payload)
  const signature = await signValue(encodedPayload)
  return `${encodedPayload}.${signature}`
}

export async function verifySessionToken(token: string | undefined | null) {
  if (!token) return null

  const [encodedPayload, signature] = token.split(".")
  if (!encodedPayload || !signature) return null

  const expectedSignature = await signValue(encodedPayload)
  if (signature !== expectedSignature) return null

  const payload = decodeJson<SessionPayload>(encodedPayload)
  if (!payload?.username || !payload?.exp) return null
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null

  return payload
}
