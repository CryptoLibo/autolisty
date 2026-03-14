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
  const response = await etsyFetch("/application/users/__SELF__/shops", token)

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || "Failed to fetch Etsy shops")
  }

  const data = await response.json()
  return Array.isArray(data.results) ? data.results : []
}

export async function ensureFreshToken(token: EtsyTokenPayload) {
  const expiresSoon = token.expires_at - Date.now() < 60_000
  if (!expiresSoon) return token
  return await refreshEtsyToken(token.refresh_token)
}
