import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { getFreshToken, loadToken } from "@/lib/integrations/tokenSession"
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
  if (!(await loadToken("pinterest"))) return Response.json({error:"Pinterest no está conectado."},{status:401})
  try {
    const token = await getFreshToken("pinterest")
    if (!token) return Response.json({error:"Pinterest no está conectado."},{status:401})
    return Response.json(await syncPinterestAnalytics(getAutomationDatabase(),token,period),
      {headers:{"Cache-Control":"private, no-store"}})
  } catch (error) {
    const code = error instanceof PinterestAnalyticsError ? error.code : "connection_failed"
    const status = error instanceof PinterestAnalyticsError ? error.status : 503
    return Response.json({error:code,stage:error instanceof PinterestAnalyticsError?error.stage:"sync",
      httpStatus:error instanceof PinterestAnalyticsError?error.status:null,
      providerCode:error instanceof PinterestAnalyticsError?error.providerCode:null},
      {status,headers:{"Cache-Control":"private, no-store"}})
  }
}
