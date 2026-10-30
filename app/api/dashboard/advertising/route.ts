import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { advertisingSnapshot } from "@/lib/dashboard/advertising"
import { isDashboardPeriod } from "@/lib/dashboard/overview"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const period = new URL(request.url).searchParams.get("period") ?? "30d"
  if (!isDashboardPeriod(period)) return Response.json({ error: "Periodo inválido." }, { status: 400 })
  try { return Response.json(advertisingSnapshot(getAutomationDatabase(),period), { headers: { "Cache-Control": "private, no-store" } }) }
  catch { return Response.json({ error: "No se pudieron consultar los gastos publicitarios." }, { status: 503 }) }
}
