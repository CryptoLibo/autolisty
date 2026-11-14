import { execFileSync } from "node:child_process"
import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { loadToken } from "@/lib/integrations/tokenSession"
import { getEtsyApiUsage } from "@/lib/etsy/client"
import { getDashboardHome } from "@/lib/dashboard/home"
import { isDashboardPeriod } from "@/lib/dashboard/overview"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

let appVersion: string | null | undefined
function currentVersion() {
  if (appVersion !== undefined) return appVersion
  try {
    appVersion = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: process.cwd(), timeout: 2000 }).toString().trim() || null
  } catch {
    appVersion = null
  }
  return appVersion
}

export async function GET(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const period = new URL(request.url).searchParams.get("period") ?? "30d"
  if (!isDashboardPeriod(period)) return Response.json({ error: "Período inválido." }, { status: 400 })
  try {
    const etsy = await loadToken("etsy")
    const pinterest = await loadToken("pinterest")
    const home = getDashboardHome(getAutomationDatabase(), period, {
      etsyConnected: Boolean(etsy),
      etsySalesAuthorized: Boolean(etsy?.scope?.includes("transactions_r")),
    })
    return Response.json({
      ...home,
      health: {
        etsyConnected: Boolean(etsy),
        pinterestConnected: Boolean(pinterest),
        etsyCallsToday: getEtsyApiUsage().calls,
        etsyDailyLimit: getEtsyApiUsage().dailyLimit,
        etsyRemainingToday: getEtsyApiUsage().remainingToday,
        appVersion: currentVersion(),
      },
    }, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return Response.json({ error: "No se pudo preparar el resumen." }, { status: 503 })
  }
}
