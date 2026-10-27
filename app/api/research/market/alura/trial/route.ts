import { randomUUID } from "node:crypto"
import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase, openAutomationReadDatabase } from "@/lib/automation/db/database"
import { ResearchRepository } from "@/lib/research/repository"
import { AluraConnector } from "@/lib/research/market/alura"
import { fetchAluraUsage } from "@/lib/research/market/aluraUsage"
import { maintenanceIsHealthy, reserveAluraCredits, settleAluraCredits } from "@/lib/research/market/aluraBudget"
import { MarketResearchRepository } from "@/lib/research/market/repository"

export const runtime = "nodejs"
const TERM = "vintage botanical wall art"
const TITLE = "Stage 4.2 trial - Vintage Botanical Wall Art"

export async function POST(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  if (process.env.NODE_ENV === "production" || process.env.MARKET_RESEARCH_TRIAL_ENABLED !== "true") {
    return Response.json({ error: "The local Alura trial is not enabled." }, { status: 403 })
  }
  const body = await request.json().catch(() => null) as { confirmation?: unknown } | null
  if (body?.confirmation !== "one-keyword-one-credit") {
    return Response.json({ error: "Explicit confirmation for one Alura keyword lookup is required." }, { status: 400 })
  }
  if (!process.env.ALURA_API_KEY) return Response.json({ error: "Alura is not configured." }, { status: 409 })
  try { openAutomationReadDatabase().close() }
  catch { return Response.json({ error: "Local research database migration is pending." }, { status: 409 }) }

  const db = getAutomationDatabase()
  if (!maintenanceIsHealthy(db)) {
    return Response.json({ error: "Independent Alura retention maintenance is not healthy." }, { status: 409 })
  }
  const repo = new MarketResearchRepository(db)
  repo.recoverInterrupted()
  const investigationId = db.transaction(() => {
    const existing = db.prepare("SELECT id FROM research_investigations WHERE title=? ORDER BY created_at LIMIT 1")
      .get(TITLE) as { id: string } | undefined
    return existing?.id || new ResearchRepository(db).createInvestigation({
      title: TITLE, mode: "directed", query: TERM, suggestedProductType: null,
    }).id
  })()
  const owner = randomUUID()
  const run = repo.claim(investigationId, "stage4.2-first-trial-keyword-vintage-botanical-wall-art", owner)
  if (!run.claimed) {
    const reason = "reason" in run ? run.reason : "active"
    return Response.json({ state: reason, investigationId,
      result: repo.getInvestigation(investigationId) }, { status: reason === "finished" ? 200 : 409 })
  }
  const query = { capability: "keywords" as const, term: TERM, limit: 1 }
  if (run.plan_json === "{}") repo.savePlan(run.id, owner, { objective: "Verify Alura keyword research and evidence lineage",
    terms: [TERM], queries: [{ provider: "alura", query }], missing: [], model: null, usage: null })
  const queryHash = MarketResearchRepository.hash({ provider: "alura", query })
  const call = repo.prepareCall({ runId: run.id, owner, provider: "alura", capability: query.capability,
    hash: queryHash, query })
  if (call.state !== "PREPARED") return Response.json({ error: "The trial call needs review; no repeat was sent." }, { status: 409 })

  let dispatched = false
  try {
    const usage = await fetchAluraUsage(process.env.ALURA_API_KEY)
    if (usage.state !== "AVAILABLE" || !usage.usage) throw new Error("Alura balance could not be verified.")
    reserveAluraCredits(db, call.id, 1, usage.usage.credits.remaining)
    repo.startCall(call.id)
    dispatched = true
    const result = await new AluraConnector(process.env.ALURA_API_KEY, true).query(query)
    repo.completeCall({ callId: call.id, runId: run.id, investigationId, provider: "alura",
      capability: "keywords", hash: queryHash, estimated: 1, result, cache: true })
    settleAluraCredits(db, call.id, result.creditsReported)
    repo.finish(run.id, result.metrics.length ? "COMPLETED" : "INSUFFICIENT",
      { consulted: ["alura"], warnings: result.warnings },
      { creditsEstimated: 1, creditsReported: result.creditsReported ?? null })
    return Response.json({ investigationId, runId: run.id, costReported: result.creditsReported ?? null,
      result: repo.getInvestigation(investigationId) })
  } catch {
    if (dispatched) {
      repo.markUnknown(call.id)
      repo.markNeedsReview(run.id, "Trial call outcome uncertain; no automatic retry.")
    } else db.prepare(`UPDATE research_runs SET lease_owner=NULL,lease_expires_at=NULL,
      error='Pre-call balance or maintenance validation failed.' WHERE id=? AND status='RUNNING'`).run(run.id)
    return Response.json({ error: dispatched ? "Trial result needs review; no repeat was sent."
      : "Trial was blocked before any paid call." }, { status: dispatched ? 502 : 409 })
  }
}
