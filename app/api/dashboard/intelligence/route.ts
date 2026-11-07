import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { loadToken } from "@/lib/integrations/tokenSession"
import { hasPinterestAnalyticsScopes } from "@/lib/dashboard/pinterest-analytics"
import { getBusinessIntelligence } from "@/lib/dashboard/intelligence"
import { isDashboardPeriod } from "@/lib/dashboard/overview"

export const runtime="nodejs"
export const dynamic="force-dynamic"
export async function GET(request:Request) {
  const unauthorized=await requireOwnerApi()
  if (unauthorized) return unauthorized
  const period=new URL(request.url).searchParams.get("period")??"30d"
  if (!isDashboardPeriod(period)) return Response.json({error:"Período inválido."},{status:400})
  try {
    const etsy=await loadToken("etsy")
    const pinterest=await loadToken("pinterest")
    return Response.json(getBusinessIntelligence(getAutomationDatabase(),period,{
      etsyConnected:Boolean(etsy),etsySalesAuthorized:Boolean(etsy?.scope?.includes("transactions_r")),
      pinterestConnected:Boolean(pinterest),pinterestAuthorized:Array.isArray(pinterest?.scope)&&hasPinterestAnalyticsScopes(pinterest.scope),
    }),{headers:{"Cache-Control":"private, no-store"}})
  } catch {return Response.json({error:"No se pudo preparar la inteligencia comercial."},{status:503})}
}
