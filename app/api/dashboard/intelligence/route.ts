import { cookies } from "next/headers"
import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { ETSY_AUTH_COOKIE, type EtsyTokenPayload } from "@/lib/etsy/auth"
import { PINTEREST_AUTH_COOKIE, type PinterestTokenPayload } from "@/lib/pinterest/auth"
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
    const store=await cookies()
    const etsyRaw=store.get(ETSY_AUTH_COOKIE)?.value
    const pinterestRaw=store.get(PINTEREST_AUTH_COOKIE)?.value
    let etsy:EtsyTokenPayload|null=null,pinterest:PinterestTokenPayload|null=null
    try {etsy=etsyRaw?JSON.parse(etsyRaw) as EtsyTokenPayload:null} catch {/* Invalid cookie cannot grant access. */}
    try {pinterest=pinterestRaw?JSON.parse(pinterestRaw) as PinterestTokenPayload:null} catch {/* Invalid cookie cannot grant access. */}
    return Response.json(getBusinessIntelligence(getAutomationDatabase(),period,{
      etsyConnected:Boolean(etsy),etsySalesAuthorized:Boolean(etsy?.scope?.includes("transactions_r")),
      pinterestConnected:Boolean(pinterest),pinterestAuthorized:Array.isArray(pinterest?.scope)&&hasPinterestAnalyticsScopes(pinterest.scope),
    }),{headers:{"Cache-Control":"private, no-store"}})
  } catch {return Response.json({error:"No se pudo preparar la inteligencia comercial."},{status:503})}
}
