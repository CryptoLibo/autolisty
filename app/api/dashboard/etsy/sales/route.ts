import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { loadToken } from "@/lib/integrations/tokenSession"
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
    const token = await loadToken("etsy")
    const authorized = Boolean(token?.scope?.includes("transactions_r"))
    return Response.json(getSalesSnapshot(getAutomationDatabase(), period, Boolean(token), authorized),
      { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return Response.json({ error: "No se pudo leer la caché de ventas." }, { status: 503 })
  }
}
