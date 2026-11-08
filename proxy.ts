import { NextResponse, type NextRequest } from "next/server"
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session"
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
  // El service worker se identifica con su endpoint de push (lo valida la ruta).
  "/api/notifications/pending",
])

function isPublicPath(pathname: string) {
  return (
    PUBLIC_PAGES.has(pathname) ||
    PUBLIC_API_PATHS.has(pathname) ||
    pathname.startsWith("/api/auth/") ||
    isMachineApiPath(pathname)
  )
}

// Rutas de máquina: cada ruta valida su propio token (agente local, Claude, conector MCP).
function isMachineApiPath(pathname: string) {
  return (
    pathname.startsWith("/api/automation/agent/") ||
    pathname.startsWith("/api/claude/") ||
    pathname === "/api/mcp"
  )
}

async function authenticatedProxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (isPublicPath(pathname)) return NextResponse.next()
  if (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next()

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 })
  }

  const loginUrl = new URL("/login", request.nextUrl)
  loginUrl.searchParams.set("callbackUrl", `${pathname}${request.nextUrl.search}`)
  return NextResponse.redirect(loginUrl)
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const host = request.headers.get("host") || ""
  const localDevAccess = isLocalDevAccess(host.split(":")[0])
  const expectedOrigin = expectedRequestOrigin(host, request.nextUrl.origin, process.env.AUTH_URL, localDevAccess)
  if (
    pathname.startsWith("/api/") &&
    !isMachineApiPath(pathname) &&
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    request.headers.get("origin") !== expectedOrigin
  ) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 })
  }

  if (localDevAccess) return NextResponse.next()
  return authenticatedProxy(request)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
