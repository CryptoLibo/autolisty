import {
  PINTEREST_API_BASE_URL,
  PinterestTokenPayload,
  refreshPinterestToken,
} from "./auth"

export async function pinterestFetch(
  path: string,
  token: PinterestTokenPayload,
  init?: RequestInit
) {
  return await fetch(`${PINTEREST_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  })
}

export async function ensureFreshPinterestToken(token: PinterestTokenPayload) {
  const expiresSoon = token.expires_at - Date.now() < 60_000

  if (!expiresSoon || !token.refresh_token) {
    return token
  }

  return await refreshPinterestToken(token.refresh_token)
}

export async function getPinterestUser(token: PinterestTokenPayload) {
  const response = await pinterestFetch("/user_account", token)

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || "Failed to fetch Pinterest user")
  }

  return await response.json()
}

export async function getPinterestBoards(token: PinterestTokenPayload) {
  const response = await pinterestFetch("/boards?page_size=100", token)

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || "Failed to fetch Pinterest boards")
  }

  return await response.json()
}
