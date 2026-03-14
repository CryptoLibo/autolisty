import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import {
  ETSY_AUTH_COOKIE,
  ETSY_PKCE_COOKIE,
  exchangeCodeForToken,
  getEtsyRedirectUri,
} from "@/lib/etsy/auth"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  const errorDescription = url.searchParams.get("error_description")
  const redirectUrl = new URL("/", getEtsyRedirectUri())

  if (error) {
    redirectUrl.searchParams.set("etsy_error", errorDescription || error)
    return NextResponse.redirect(redirectUrl)
  }

  if (!code || !state) {
    redirectUrl.searchParams.set("etsy_error", "Missing Etsy authorization response")
    return NextResponse.redirect(redirectUrl)
  }

  const cookieStore = await cookies()
  const pkceCookie = cookieStore.get(ETSY_PKCE_COOKIE)?.value

  if (!pkceCookie) {
    redirectUrl.searchParams.set("etsy_error", "Missing Etsy PKCE session")
    return NextResponse.redirect(redirectUrl)
  }

  try {
    const { state: expectedState, codeVerifier } = JSON.parse(pkceCookie)

    if (!expectedState || expectedState !== state || !codeVerifier) {
      throw new Error("Invalid Etsy state")
    }

    const token = await exchangeCodeForToken({
      code,
      codeVerifier,
    })

    cookieStore.set(ETSY_AUTH_COOKIE, JSON.stringify(token), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
    })
    cookieStore.delete(ETSY_PKCE_COOKIE)

    redirectUrl.searchParams.set("etsy_connected", "1")
    return NextResponse.redirect(redirectUrl)
  } catch (authError: any) {
    cookieStore.delete(ETSY_PKCE_COOKIE)
    redirectUrl.searchParams.set(
      "etsy_error",
      authError?.message || "Failed to complete Etsy auth"
    )
    return NextResponse.redirect(redirectUrl)
  }
}
