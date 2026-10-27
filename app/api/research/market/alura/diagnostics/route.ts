import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase, openAutomationReadDatabase } from "@/lib/automation/db/database"
import { fetchAluraUsage, recordAluraDiagnostic } from "@/lib/research/market/aluraUsage"

export const runtime = "nodejs"

export async function POST() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  if (process.env.NODE_ENV === "production") return Response.json({ error: "Local diagnostic only." }, { status: 403 })
  if (!process.env.ALURA_API_KEY) return Response.json({ state: "NOT_CONFIGURED" }, { status: 409 })
  try { openAutomationReadDatabase().close() }
  catch { return Response.json({ error: "Local research database must be migrated before diagnostics." }, { status: 409 }) }
  const result = await fetchAluraUsage(process.env.ALURA_API_KEY)
  recordAluraDiagnostic(getAutomationDatabase(), result)
  return Response.json({ state: result.state, httpStatus: result.httpStatus, latencyMs: result.latencyMs,
    plan: result.usage?.plan || null, creditsRemaining: result.usage?.credits.remaining ?? null,
    creditsCost: result.creditsCost, rateLimit: result.usage?.rate_limit.requests_per_minute ?? null,
    errorCode: result.errorCode })
}
