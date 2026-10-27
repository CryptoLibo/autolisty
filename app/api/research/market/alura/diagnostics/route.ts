import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase, openAutomationReadDatabase } from "@/lib/automation/db/database"
import { fetchAluraUsage, recordAluraDiagnostic } from "@/lib/research/market/aluraUsage"

export const runtime = "nodejs"

export async function POST() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const key = process.env.ALURA_API_KEY?.trim()
  if (!key) return Response.json({ state: "NOT_CONFIGURED", error: "ALURA_API_KEY is not configured on the server." }, { status: 409 })
  try { openAutomationReadDatabase().close() }
  catch { return Response.json({ error: "Research database must be migrated before diagnostics." }, { status: 409 }) }
  const result = await fetchAluraUsage(key)
  recordAluraDiagnostic(getAutomationDatabase(), result)
  const error = result.errorCode === "http_401" ? "Alura rejected the API key (401). Check the server credential."
    : result.errorCode === "http_403" ? "Alura denied usage access (403). Check the usage:read permission."
    : result.errorCode === "http_429" ? "Alura rate limit reached. Try again later."
    : result.errorCode === "connection_failed" ? "Could not connect to Alura. Check server network access."
    : result.errorCode === "invalid_usage_response" ? "Alura returned an invalid usage response."
    : result.errorCode ? `Alura rejected the usage request (${result.httpStatus ?? "unknown status"}).` : null
  return Response.json({ state: result.state, httpStatus: result.httpStatus, latencyMs: result.latencyMs,
    plan: result.usage?.plan || null, creditsRemaining: result.usage?.credits.remaining ?? null,
    creditsCost: result.creditsCost, rateLimit: result.usage?.rate_limit.requests_per_minute ?? null,
    errorCode: result.errorCode, error }, { status: error ? result.httpStatus === 429 ? 429 : result.state === "NOT_AUTHORIZED" ? 403 : 502 : 200,
    headers: { "Cache-Control": "no-store" } })
}
