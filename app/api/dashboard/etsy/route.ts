import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { loadToken } from "@/lib/integrations/tokenSession"
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
    const connected = Boolean(await loadToken("etsy"))
    return Response.json(getCatalogSnapshot(getAutomationDatabase(), period, connected),
      { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return Response.json({ error: "No se pudo leer la caché de Etsy." }, { status: 503 })
  }
}
