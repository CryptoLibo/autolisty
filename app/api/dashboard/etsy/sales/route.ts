import { cookies } from "next/headers"
import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { ETSY_AUTH_COOKIE, type EtsyTokenPayload } from "@/lib/etsy/auth"
import { getSalesSnapshot } from "@/lib/dashboard/etsy-sales"
import { isDashboardPeriod } from "@/lib/dashboard/overview"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const period = new URL(request.url).searchParams.get("period") || "30d"
  if (!isDashboardPeriod(period)) return Response.json({ error: "Periodo no válido." }, { status: 400 })
  try {
    const raw = (await cookies()).get(ETSY_AUTH_COOKIE)?.value
    let token: EtsyTokenPayload | null = null
    try { token = raw ? JSON.parse(raw) as EtsyTokenPayload : null } catch { /* Invalid cookie is not a source of sales. */ }
    const authorized = Boolean(token?.scope?.includes("transactions_r"))
    return Response.json(getSalesSnapshot(getAutomationDatabase(), period, Boolean(raw), authorized),
      { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return Response.json({ error: "No se pudo leer la caché de ventas." }, { status: 503 })
  }
}
