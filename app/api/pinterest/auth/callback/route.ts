import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { loadToken, saveToken } from "@/lib/integrations/tokenSession"
import {
  exchangePinterestCodeForToken,
  getPinterestRedirectUri,
  PINTEREST_PKCE_COOKIE,
} from "@/lib/pinterest/auth"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  const redirectUrl = new URL("/", getPinterestRedirectUri())

  if (error) {
    redirectUrl.searchParams.set("pinterest_error", error)
    return NextResponse.redirect(redirectUrl)
  }

  if (!code || !state) {
    redirectUrl.searchParams.set(
      "pinterest_error",
      "Missing Pinterest authorization response"
    )
    return NextResponse.redirect(redirectUrl)
  }

  const cookieStore = await cookies()
  const pkceCookie = cookieStore.get(PINTEREST_PKCE_COOKIE)?.value

  if (!pkceCookie) {
    redirectUrl.searchParams.set("pinterest_error", "Missing Pinterest PKCE session")
    return NextResponse.redirect(redirectUrl)
  }

  try {
    const { state: expectedState, codeVerifier } = JSON.parse(pkceCookie)

    if (!expectedState || expectedState !== state || !codeVerifier) {
      throw new Error("Invalid Pinterest state")
    }

    const token = await exchangePinterestCodeForToken({
      code,
      codeVerifier,
    })
    const existing = await loadToken("pinterest").catch(() => null)
    const existingScopes = Array.isArray(existing?.scope)
      ? existing.scope.filter((value): value is string => typeof value === "string")
      : []
    const requiredScopes = new Set(["user_accounts:read", "boards:read", "boards:write", "pins:read", "pins:write", ...existingScopes])
    if ([...requiredScopes].some((scope) => !token.scope.includes(scope))) {
      throw new Error("Pinterest no concedió todos los permisos actuales; la conexión anterior se conserva.")
    }

    await saveToken("pinterest", token)
    cookieStore.delete(PINTEREST_PKCE_COOKIE)

    redirectUrl.searchParams.set("pinterest_connected", "1")
    return NextResponse.redirect(redirectUrl)
  } catch {
    cookieStore.delete(PINTEREST_PKCE_COOKIE)
    redirectUrl.searchParams.set(
      "pinterest_error",
      "Failed to complete Pinterest auth"
    )
    return NextResponse.redirect(redirectUrl)
  }
}
