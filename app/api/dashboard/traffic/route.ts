import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { saveTrafficObservation, trafficSnapshot, TrafficInputError, type TrafficInput } from "@/lib/dashboard/etsy-traffic"
import { isDashboardPeriod } from "@/lib/dashboard/overview"

export const runtime = "nodejs"
export async function GET(request: Request) {
  const unauthorized=await requireOwnerApi()
  if (unauthorized) return unauthorized
  const period=new URL(request.url).searchParams.get("period") ?? "30d"
  if (!isDashboardPeriod(period)) return Response.json({error:"Periodo inválido."},{status:400})
  try {return Response.json(trafficSnapshot(getAutomationDatabase(),period),{headers:{"Cache-Control":"private, no-store"}})}
  catch {return Response.json({error:"No se pudieron leer las estadísticas."},{status:503})}
}
export async function POST(request: Request) {
  const unauthorized=await requireOwnerApi()
  if (unauthorized) return unauthorized
  try {
    const body=await request.json() as {period?:string;data?:TrafficInput}
    const period=body.period ?? null
    if (!isDashboardPeriod(period) || !body.data || typeof body.data !== "object")
      return Response.json({error:"Datos inválidos."},{status:400})
    return Response.json(saveTrafficObservation(getAutomationDatabase(),period,body.data),{headers:{"Cache-Control":"private, no-store"}})
  } catch (error) {
    if (error instanceof TrafficInputError) return Response.json({error:error.message},{status:400})
    return Response.json({error:"No se pudo registrar la observación."},{status:503})
  }
}
