import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase, openAutomationReadDatabase } from "@/lib/automation/db/database"
import { marketConnectors, marketStatuses } from "@/lib/research/market/connectors"
import { executeMarketResearch, DEFAULT_MARKET_LIMITS } from "@/lib/research/market/engine"
import { openAiMarketPlanner } from "@/lib/research/market/plan"
import { MarketResearchRepository } from "@/lib/research/market/repository"
import { marketDiagnostics } from "@/lib/research/market/diagnostics"
import { fetchAluraUsage } from "@/lib/research/market/aluraUsage"
import { reserveAluraCredits, settleAluraCredits, aluraBudgetStatus } from "@/lib/research/market/aluraBudget"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 90

export async function GET(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  try { openAutomationReadDatabase().close() }
  catch { return Response.json({ error: "Research database migration is pending.", schemaReady: false }, { status: 409 }) }
  try {
    const connectors = marketConnectors()
    const statuses = marketStatuses(connectors)
    const investigationId = new URL(request.url).searchParams.get("investigationId")
    const db = getAutomationDatabase()
    const repo = new MarketResearchRepository(db)
    repo.recoverInterrupted()
    return Response.json({ statuses, diagnostics: marketDiagnostics(db, connectors), aluraBudget: aluraBudgetStatus(db),
      fullResearchEnabled: process.env.MARKET_RESEARCH_FULL_RUN_ENABLED === "true", result: investigationId
      ? repo.getInvestigation(investigationId) : null })
  } catch { return Response.json({ error: "Research data is unavailable." }, { status: 500 }) }
}

export async function POST(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  try { openAutomationReadDatabase().close() }
  catch { return Response.json({ error: "Research database migration is pending. No account calls were made." }, { status: 409 }) }
  if (process.env.MARKET_RESEARCH_FULL_RUN_ENABLED !== "true") {
    return Response.json({ error: "Full research requires a separate owner approval. No account calls were made." }, { status: 409 })
  }
  if (process.env.MARKET_RESEARCH_LIVE_ENABLED !== "true") {
    return Response.json({ error: "Live research is disabled. No account calls were made." }, { status: 409 })
  }
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "Research planner is not configured." }, { status: 409 })
  try {
    const body = await request.json() as { investigationId?: string; request?: string; force?: boolean; confirmedPaidResearch?: boolean }
    if (typeof body.investigationId !== "string" || typeof body.request !== "string" ||
      (body.force !== undefined && typeof body.force !== "boolean")) throw new Error("Invalid research request.")
    if (body.confirmedPaidResearch !== true) {
      return Response.json({ error: "Explicit owner confirmation is required before any paid research." }, { status: 409 })
    }
    const db = getAutomationDatabase()
    const result = await executeMarketResearch(db, body.investigationId, body.request,
      marketConnectors(), openAiMarketPlanner, DEFAULT_MARKET_LIMITS, body.force || false, {
        beforeCall: async (callId, estimatedCost) => {
          if (!process.env.ALURA_API_KEY) throw new Error("Alura key is unavailable.")
          const usage = await fetchAluraUsage(process.env.ALURA_API_KEY)
          if (usage.state !== "AVAILABLE" || !usage.usage) throw new Error("Alura balance could not be verified.")
          reserveAluraCredits(db, callId, estimatedCost, usage.usage.credits.remaining)
        },
        afterCall: (callId, reportedCost) => settleAluraCredits(db, callId, reportedCost),
      })
    return Response.json({ result, statuses: marketStatuses(marketConnectors()) })
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Research failed." }, { status: 400 }) }
}
