import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import {
  buildPinterestAuthorizeUrl,
  createPinterestPkcePair,
  PINTEREST_PKCE_COOKIE,
} from "@/lib/pinterest/auth"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const { state, codeVerifier, codeChallenge } = createPinterestPkcePair()
    const cookieStore = await cookies()

    cookieStore.set(
      PINTEREST_PKCE_COOKIE,
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
      buildPinterestAuthorizeUrl({
        state,
        codeChallenge,
      })
    )
  } catch (error: any) {
    const requestUrl = new URL(req.url)
    const url = new URL("/", requestUrl.origin)
    url.searchParams.set(
      "pinterest_error",
      error?.message || "Failed to start Pinterest auth"
    )
    return NextResponse.redirect(url)
  }
}
