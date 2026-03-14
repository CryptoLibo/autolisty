import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { buildEtsyAuthorizeUrl, createPkcePair, ETSY_PKCE_COOKIE } from "@/lib/etsy/auth"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const { state, codeVerifier, codeChallenge } = createPkcePair()
    const cookieStore = await cookies()

    cookieStore.set(
      ETSY_PKCE_COOKIE,
      JSON.stringify({
        state,
        codeVerifier,
      }),
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 10,
      }
    )

    return NextResponse.redirect(
      buildEtsyAuthorizeUrl({
        state,
        codeChallenge,
      })
    )
  } catch (error: any) {
    const requestUrl = new URL(req.url)
    const url = new URL("/", requestUrl.origin)
    url.searchParams.set("etsy_error", error?.message || "Failed to start Etsy auth")
    return NextResponse.redirect(url)
  }
}
