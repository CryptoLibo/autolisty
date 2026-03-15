import crypto from "crypto"

export const PINTEREST_SCOPES = [
  "user_accounts:read",
  "boards:read",
  "boards:write",
  "pins:read",
  "pins:write",
] as const

export const PINTEREST_AUTH_COOKIE = "pinterest_auth"
export const PINTEREST_PKCE_COOKIE = "pinterest_pkce"
export const PINTEREST_AUTH_BASE_URL = "https://www.pinterest.com/oauth/"
export const PINTEREST_TOKEN_URL = "https://api.pinterest.com/v5/oauth/token"
export const PINTEREST_API_BASE_URL = "https://api.pinterest.com/v5"

export type PinterestTokenPayload = {
  access_token: string
  refresh_token?: string
  expires_at: number
  scope: string[]
  token_type: string
}

function base64UrlEncode(input: Buffer) {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

export function getRequiredPinterestEnv(name: string) {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

export function getPinterestRedirectUri() {
  return getRequiredPinterestEnv("PINTEREST_REDIRECT_URI")
}

export function createPinterestPkcePair() {
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

export function buildPinterestAuthorizeUrl({
  state,
  codeChallenge,
}: {
  state: string
  codeChallenge: string
}) {
  const url = new URL(PINTEREST_AUTH_BASE_URL)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", getRequiredPinterestEnv("PINTEREST_APP_ID"))
  url.searchParams.set("redirect_uri", getPinterestRedirectUri())
  url.searchParams.set("scope", PINTEREST_SCOPES.join(","))
  url.searchParams.set("state", state)
  url.searchParams.set("code_challenge", codeChallenge)
  url.searchParams.set("code_challenge_method", "S256")
  return url.toString()
}

export async function exchangePinterestCodeForToken({
  code,
  codeVerifier,
}: {
  code: string
  codeVerifier: string
}) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getPinterestRedirectUri(),
    code_verifier: codeVerifier,
  })

  const credentials = Buffer.from(
    `${getRequiredPinterestEnv("PINTEREST_APP_ID")}:${getRequiredPinterestEnv("PINTEREST_APP_SECRET")}`
  ).toString("base64")

  const response = await fetch(PINTEREST_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || "Failed to exchange Pinterest authorization code")
  }

  const data = await response.json()
  return normalizePinterestToken(data)
}

export async function refreshPinterestToken(refreshToken: string) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  })

  const credentials = Buffer.from(
    `${getRequiredPinterestEnv("PINTEREST_APP_ID")}:${getRequiredPinterestEnv("PINTEREST_APP_SECRET")}`
  ).toString("base64")

  const response = await fetch(PINTEREST_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || "Failed to refresh Pinterest token")
  }

  const data = await response.json()
  return normalizePinterestToken(data)
}

function normalizePinterestToken(data: any): PinterestTokenPayload {
  const accessToken = String(data.access_token || "")
  const refreshToken =
    typeof data.refresh_token === "string" ? data.refresh_token : undefined
  const expiresIn = Number(data.expires_in || 0)
  const tokenType = String(data.token_type || "bearer")
  const scope = Array.isArray(data.scope)
    ? data.scope.map((item: unknown) => String(item))
    : typeof data.scope === "string"
      ? data.scope.split(/[,\s]+/).filter(Boolean)
      : [...PINTEREST_SCOPES]

  if (!accessToken) {
    throw new Error("Pinterest token response is missing access_token")
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Date.now() + expiresIn * 1000,
    scope,
    token_type: tokenType,
  }
}
