import crypto from "crypto"

export const ETSY_SCOPES = ["shops_r", "listings_r", "listings_w"] as const
export const ETSY_AUTH_COOKIE = "etsy_auth"
export const ETSY_PKCE_COOKIE = "etsy_pkce"
export const ETSY_AUTH_BASE_URL = "https://www.etsy.com/oauth/connect"
export const ETSY_TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token"
export const ETSY_API_BASE_URL = "https://api.etsy.com/v3"

export type EtsyTokenPayload = {
  access_token: string
  refresh_token: string
  expires_at: number
  token_type: string
  user_id: string
  scope: string[]
}

function base64UrlEncode(input: Buffer) {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

export function getRequiredEnv(name: string) {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

export function getEtsyRedirectUri() {
  return getRequiredEnv("ETSY_REDIRECT_URI")
}

export function getEtsyApiKeyHeader() {
  const apiKey = getRequiredEnv("ETSY_API_KEY")
  const sharedSecret = getRequiredEnv("ETSY_SHARED_SECRET")
  return `${apiKey}:${sharedSecret}`
}

export function createPkcePair() {
  const state = base64UrlEncode(crypto.randomBytes(32))
  const codeVerifier = base64UrlEncode(crypto.randomBytes(32))
  const codeChallenge = base64UrlEncode(
    crypto.createHash("sha256").update(codeVerifier).digest()
  )

  return {
    state,
    codeVerifier,
    codeChallenge,
  }
}

export function buildEtsyAuthorizeUrl({
  state,
  codeChallenge,
}: {
  state: string
  codeChallenge: string
}) {
  const url = new URL(ETSY_AUTH_BASE_URL)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", getRequiredEnv("ETSY_API_KEY"))
  url.searchParams.set("redirect_uri", getEtsyRedirectUri())
  url.searchParams.set("scope", ETSY_SCOPES.join(" "))
  url.searchParams.set("state", state)
  url.searchParams.set("code_challenge", codeChallenge)
  url.searchParams.set("code_challenge_method", "S256")
  return url.toString()
}

export async function exchangeCodeForToken({
  code,
  codeVerifier,
}: {
  code: string
  codeVerifier: string
}) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: getRequiredEnv("ETSY_API_KEY"),
    redirect_uri: getEtsyRedirectUri(),
    code,
    code_verifier: codeVerifier,
  })

  const response = await fetch(ETSY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || "Failed to exchange Etsy authorization code")
  }

  const data = await response.json()
  return normalizeTokenResponse(data)
}

export async function refreshEtsyToken(refreshToken: string) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: getRequiredEnv("ETSY_API_KEY"),
    refresh_token: refreshToken,
  })

  const response = await fetch(ETSY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || "Failed to refresh Etsy token")
  }

  const data = await response.json()
  return normalizeTokenResponse(data)
}

function normalizeTokenResponse(data: any): EtsyTokenPayload {
  const accessToken = String(data.access_token || "")
  const refreshToken = String(data.refresh_token || "")
  const expiresIn = Number(data.expires_in || 0)
  const tokenType = String(data.token_type || "Bearer")
  const userId = accessToken.split(".")[0]
  const scope = Array.isArray(data.scope)
    ? data.scope.map((item: unknown) => String(item))
    : typeof data.scope === "string"
      ? data.scope.split(" ").filter(Boolean)
      : [...ETSY_SCOPES]

  if (!accessToken || !refreshToken || !userId) {
    throw new Error("Etsy token response is missing required fields")
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Date.now() + expiresIn * 1000,
    token_type: tokenType,
    user_id: userId,
    scope,
  }
}
