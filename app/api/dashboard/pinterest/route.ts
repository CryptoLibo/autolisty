import { cookies } from "next/headers"
import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { PINTEREST_AUTH_COOKIE, type PinterestTokenPayload } from "@/lib/pinterest/auth"
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
    const raw = (await cookies()).get(PINTEREST_AUTH_COOKIE)?.value
    let token: PinterestTokenPayload | null = null
    try { token = raw ? JSON.parse(raw) as PinterestTokenPayload : null } catch { /* Invalid cookie cannot grant analytics access. */ }
    return Response.json(getPinterestSnapshot(getAutomationDatabase(),period,Boolean(raw),
      Array.isArray(token?.scope) && hasPinterestAnalyticsScopes(token.scope)),
      {headers:{"Cache-Control":"private, no-store"}})
  } catch { return Response.json({error:"No se pudo leer la caché de Pinterest."},{status:503}) }
}
