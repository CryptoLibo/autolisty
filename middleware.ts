import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getSessionCookieName, verifySessionToken } from "@/lib/auth/session"

const PUBLIC_PATHS = ["/login", "/privacy-policy", "/terms-of-use"]
const PUBLIC_API_PATHS = ["/api/auth/login"]

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  )
}

function isPublicApiPath(pathname: string) {
  return PUBLIC_API_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  )
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/robots.txt") ||
    pathname.startsWith("/sitemap.xml")
  ) {
    return NextResponse.next()
  }

  const sessionToken = req.cookies.get(getSessionCookieName())?.value
  const session = await verifySessionToken(sessionToken)

  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/", req.url))
  }

  if (isPublicPath(pathname) || isPublicApiPath(pathname)) {
    return NextResponse.next()
  }

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const loginUrl = new URL("/login", req.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
