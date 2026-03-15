import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import {
  exchangePinterestCodeForToken,
  getPinterestRedirectUri,
  PINTEREST_AUTH_COOKIE,
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

    cookieStore.set(PINTEREST_AUTH_COOKIE, JSON.stringify(token), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    })
    cookieStore.delete(PINTEREST_PKCE_COOKIE)

    redirectUrl.searchParams.set("pinterest_connected", "1")
    return NextResponse.redirect(redirectUrl)
  } catch (authError: any) {
    cookieStore.delete(PINTEREST_PKCE_COOKIE)
    redirectUrl.searchParams.set(
      "pinterest_error",
      authError?.message || "Failed to complete Pinterest auth"
    )
    return NextResponse.redirect(redirectUrl)
  }
}
