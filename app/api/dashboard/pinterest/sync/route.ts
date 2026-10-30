import { cookies } from "next/headers"
import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { PINTEREST_AUTH_COOKIE, type PinterestTokenPayload } from "@/lib/pinterest/auth"
import { ensureFreshPinterestToken } from "@/lib/pinterest/client"
import { PinterestAnalyticsError, syncPinterestAnalytics } from "@/lib/dashboard/pinterest-analytics"
import { isDashboardPeriod } from "@/lib/dashboard/overview"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  let period: string
  try { period = (await request.json() as {period?:string}).period ?? "30d" }
  catch { return Response.json({error:"Solicitud inválida."},{status:400}) }
  if (!isDashboardPeriod(period)) return Response.json({error:"Periodo inválido."},{status:400})
  const cookieStore = await cookies()
  const raw = cookieStore.get(PINTEREST_AUTH_COOKIE)?.value
  if (!raw) return Response.json({error:"Pinterest no está conectado."},{status:401})
  try {
    const parsed = JSON.parse(raw) as PinterestTokenPayload
    const token = await ensureFreshPinterestToken(parsed)
    if (token.access_token !== parsed.access_token || token.expires_at !== parsed.expires_at) {
      cookieStore.set(PINTEREST_AUTH_COOKIE,JSON.stringify(token),{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:60*60*24*30})
    }
    return Response.json(await syncPinterestAnalytics(getAutomationDatabase(),token,period),
      {headers:{"Cache-Control":"private, no-store"}})
  } catch (error) {
    const code = error instanceof PinterestAnalyticsError ? error.code : "connection_failed"
    const status = error instanceof PinterestAnalyticsError ? error.status : 503
    return Response.json({error:code},{status,headers:{"Cache-Control":"private, no-store"}})
  }
}
