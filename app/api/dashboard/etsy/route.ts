import { cookies } from "next/headers"
import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { ETSY_AUTH_COOKIE } from "@/lib/etsy/auth"
import { getCatalogSnapshot } from "@/lib/dashboard/etsy-catalog"
import { isDashboardPeriod } from "@/lib/dashboard/overview"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const period = new URL(request.url).searchParams.get("period") || "30d"
  if (!isDashboardPeriod(period)) return Response.json({ error: "Periodo no válido." }, { status: 400 })
  try {
    const connected = Boolean((await cookies()).get(ETSY_AUTH_COOKIE)?.value)
    return Response.json(getCatalogSnapshot(getAutomationDatabase(), period, connected),
      { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return Response.json({ error: "No se pudo leer la caché de Etsy." }, { status: 503 })
  }
}
