import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { getDashboardOverview, isDashboardPeriod } from "@/lib/dashboard/overview"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized

  const requestedPeriod = new URL(request.url).searchParams.get("period")
  if (requestedPeriod !== null && !isDashboardPeriod(requestedPeriod)) {
    return Response.json({ error: "Periodo no valido." }, { status: 400 })
  }

  try {
    const overview = getDashboardOverview(getAutomationDatabase(), requestedPeriod || "30d")
    return Response.json(overview, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return Response.json({ error: "No se pudo consultar Automation. Intenta actualizar de nuevo." }, { status: 503 })
  }
}
