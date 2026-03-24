import { ETSY_API_BASE_URL, EtsyTokenPayload, getEtsyApiKeyHeader, refreshEtsyToken } from "./auth"

export async function etsyFetch(
  path: string,
  token: EtsyTokenPayload,
  init?: RequestInit
) {
  const response = await fetch(`${ETSY_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "x-api-key": getEtsyApiKeyHeader(),
      Authorization: `Bearer ${token.access_token}`,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  })

  return response
}

export async function getSelfShops(token: EtsyTokenPayload) {
  const numericUserId = Number(token.user_id)

  if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
    throw new Error("Etsy token is missing a valid numeric user id.")
  }

  const response = await etsyFetch(`/application/users/${numericUserId}/shops`, token)

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || "Failed to fetch Etsy shops")
  }

  const data = await response.json()

  if (Array.isArray(data)) {
    return data
  }

  if (Array.isArray(data?.results)) {
    return data.results
  }

  if (Array.isArray(data?.shops)) {
    return data.shops
  }

  return []
}

export async function getSelfShopsDebug(token: EtsyTokenPayload) {
  const numericUserId = Number(token.user_id)

  if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
    throw new Error("Etsy token is missing a valid numeric user id.")
  }

  const response = await etsyFetch(`/application/users/${numericUserId}/shops`, token)
  const rawText = await response.text()

  let parsed: unknown = null
  try {
    parsed = rawText ? JSON.parse(rawText) : null
  } catch {
    parsed = null
  }

  return {
    ok: response.ok,
    status: response.status,
    rawText,
    parsed,
  }
}

export async function ensureFreshToken(token: EtsyTokenPayload) {
  const expiresSoon = token.expires_at - Date.now() < 60_000
  if (!expiresSoon) return token
  return await refreshEtsyToken(token.refresh_token)
}
