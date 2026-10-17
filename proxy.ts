import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server"
import { auth } from "@/auth"
import { isLocalDevAccess } from "@/lib/auth/local-dev"
import { expectedRequestOrigin } from "@/lib/auth/request-origin"

const PUBLIC_PAGES = new Set([
  "/login",
  "/about",
  "/contact",
  "/privacy-policy",
  "/terms-of-use",
])

const PUBLIC_API_PATHS = new Set([
  "/api/contact",
  "/api/etsy/auth/callback",
  "/api/pinterest/auth/callback",
  "/api/company/telegram/webhook",
])

function isPublicPath(pathname: string) {
  return (
    PUBLIC_PAGES.has(pathname) ||
    PUBLIC_API_PATHS.has(pathname) ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/automation/agent/")
  )
}

const authenticatedProxy = auth((request) => {
  const { pathname } = request.nextUrl
  if (isPublicPath(pathname) || request.auth) return NextResponse.next()

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 })
  }

  const loginUrl = new URL("/login", request.nextUrl)
  loginUrl.searchParams.set("callbackUrl", `${pathname}${request.nextUrl.search}`)
  return NextResponse.redirect(loginUrl)
})

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl
  const host = request.headers.get("host") || ""
  const localDevAccess = isLocalDevAccess(host.split(":")[0])
  const expectedOrigin = expectedRequestOrigin(host, request.nextUrl.origin, process.env.AUTH_URL, localDevAccess)
  if (
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/auth/") &&
    !pathname.startsWith("/api/automation/agent/") &&
    pathname !== "/api/company/telegram/webhook" &&
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    request.headers.get("origin") !== expectedOrigin
  ) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 })
  }

  if (localDevAccess) return NextResponse.next()
  return (authenticatedProxy as unknown as (request: NextRequest, event: NextFetchEvent) => Response | Promise<Response>)(request, event)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
