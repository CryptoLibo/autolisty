import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { loadToken } from "@/lib/integrations/tokenSession"
import { getPinterestSnapshot, hasPinterestAnalyticsScopes } from "@/lib/dashboard/pinterest-analytics"
import { isDashboardPeriod } from "@/lib/dashboard/overview"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const period = new URL(request.url).searchParams.get("period") ?? "30d"
  if (!isDashboardPeriod(period)) return Response.json({error:"Periodo inválido."},{status:400})
  try {
    const token = await loadToken("pinterest")
    return Response.json(getPinterestSnapshot(getAutomationDatabase(),period,Boolean(token),
      Array.isArray(token?.scope) && hasPinterestAnalyticsScopes(token.scope)),
      {headers:{"Cache-Control":"private, no-store"}})
  } catch { return Response.json({error:"No se pudo leer la caché de Pinterest."},{status:503}) }
}
