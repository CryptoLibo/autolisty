import type Database from "better-sqlite3"
import { randomUUID } from "node:crypto"
import type { MarketConnector, MarketMetric, MarketQuery, ProviderStatus } from "./contracts"
import type { MarketPlan, Planner } from "./plan"
import { MarketResearchRepository } from "./repository"
import { providerPolicies } from "./providerPolicies.mjs"

export type MarketLimits = { maxQueries: number; maxCreditsAlura: number; maxEverBeeRequests: number;
  maxEtsyRequests: number; maxDurationMs: number }
export const DEFAULT_MARKET_LIMITS: MarketLimits = { maxQueries: 4, maxCreditsAlura: 20,
  maxEverBeeRequests: 2, maxEtsyRequests: 2, maxDurationMs: 45000 }
export type AluraCallSafety = {
  beforeCall(callId: string, estimatedCost: number): Promise<void>
  afterCall(callId: string, reportedCost: number | undefined): void
}

export function compareMarketMetrics(metrics: MarketMetric[]) {
  const grouped = new Map<string, MarketMetric[]>()
  for (const metric of metrics) {
    const key = `${metric.subject.toLowerCase()}|${metric.metric}|${metric.unit}|${metric.period}`
    grouped.set(key, [...(grouped.get(key) || []), metric])
  }
  return [...grouped.values()].filter((group) => group.length > 1 && new Set(group.map((item) => item.value)).size > 1)
    .map((group) => ({ subject: group[0].subject, metric: group[0].metric,
      variants: group.map(({ provider, value, period, sourceUrl }) => ({ provider, value, period, sourceUrl })) }))
}

export async function executeMarketResearch(db: Database.Database, investigationId: string, request: string,
  connectors: MarketConnector[], planner: Planner, limits: MarketLimits = DEFAULT_MARKET_LIMITS,
  force = false, aluraSafety?: AluraCallSafety) {
  if (!request.trim() || request.length > 500) throw new Error("Research request must contain 1-500 characters.")
  if (!Number.isInteger(limits.maxQueries) || limits.maxQueries < 1 || limits.maxQueries > 10 ||
      !Number.isInteger(limits.maxCreditsAlura) || limits.maxCreditsAlura < 0 || limits.maxCreditsAlura > 100 ||
      !Number.isInteger(limits.maxEverBeeRequests) || limits.maxEverBeeRequests < 0 || limits.maxEverBeeRequests > 10 ||
      !Number.isInteger(limits.maxEtsyRequests) || limits.maxEtsyRequests < 0 || limits.maxEtsyRequests > 10 ||
      limits.maxDurationMs < 1000 || limits.maxDurationMs > 120000) throw new Error("Invalid research limits.")
  const repo = new MarketResearchRepository(db)
  const investigation = db.prepare("SELECT id FROM research_investigations WHERE id=?").get(investigationId)
  if (!investigation) throw new Error("Investigation not found.")
  const hash = MarketResearchRepository.hash({ request: request.trim().toLowerCase(), connectors: connectors.map((item) => item.status()),
    limits, retentionWindow: Math.floor(Date.now() / (23 * 60 * 60 * 1000)), force: force ? randomUUID() : null })
  repo.recoverInterrupted()
  const owner = randomUUID()
  const started = repo.claim(investigationId, hash, owner)
  if (!started.claimed) return { ...repo.getInvestigation(investigationId), cached: true }
  let plan: MarketPlan
  try {
    if (started.plan_json !== "{}") plan = JSON.parse(started.plan_json) as MarketPlan
    else {
      plan = await planner(request, connectors)
      repo.savePlan(started.id, owner, plan)
    }
  } catch {
    // The planner request may have been billed; an operator must decide whether to retry.
    db.prepare("UPDATE research_runs SET recovery_state='NEEDS_REVIEW',lease_owner=NULL,lease_expires_at=NULL,error=? WHERE id=?")
      .run("Planning outcome unknown.", started.id)
    return { ...repo.getInvestigation(investigationId), cached: false }
  }
  const deadline = Date.now() + limits.maxDurationMs
  const sourceStatus: Record<string, ProviderStatus> = Object.fromEntries(connectors.map((item) => [item.provider, item.status()]))
  const coverage: { consulted: string[]; skipped: Array<{ provider: string; reason: string }>; warnings: string[]; discrepancies: unknown[] } =
    { consulted: [], skipped: [], warnings: [...plan.missing], discrepancies: [] }
  let creditsEstimated = 0, creditsReported = 0, reportedKnown = true, queriesExecuted = 0, everBeeRequests = 0, etsyRequests = 0
  if (started.resumed) {
    const prior = db.prepare(`SELECT provider,COUNT(*) AS calls,COALESCE(SUM(credits_estimated),0) AS estimated,
      COALESCE(SUM(credits_reported),0) AS reported FROM research_queries WHERE run_id=? GROUP BY provider`)
      .all(started.id) as Array<{ provider: string; calls: number; estimated: number; reported: number }>
    for (const row of prior) {
      queriesExecuted += row.calls
      if (row.provider === "alura") { creditsEstimated += row.estimated; creditsReported += row.reported }
      if (row.provider === "everbee") everBeeRequests += row.estimated
      if (row.provider === "etsy") etsyRequests += row.estimated
    }
  }
  let attemptedSkip = false
  let outcomeUnknown = false
  const collected: Array<{ metric: MarketMetric; evidenceId: string }> = []
  try {
    for (const item of plan.queries) {
      if (repo.cancellationRequested(started.id)) { attemptedSkip = true; break }
      const connector = connectors.find((candidate) => candidate.provider === item.provider)
      if (!connector || sourceStatus[item.provider]?.state !== "AVAILABLE" || !connector.status().capabilities.includes(item.query.capability)) {
        attemptedSkip = true
        coverage.skipped.push({ provider: item.provider, reason: "Connector or capability unavailable." }); continue
      }
      if (!providerPolicies[item.provider as keyof typeof providerPolicies]?.storeEvidence) {
        attemptedSkip = true
        coverage.skipped.push({ provider: item.provider, reason: "Provider storage policy pending; no commercial call dispatched." })
        continue
      }
      const query: MarketQuery = { ...item.query, limit: Math.max(1, Math.min(25, item.query.limit)) }
      const queryHash = MarketResearchRepository.hash({ provider: item.provider, query })
      const completed = db.prepare(`SELECT id FROM research_call_ledger WHERE run_id=? AND query_hash=? AND state='COMPLETED'`)
        .get(started.id, queryHash) as { id: string } | undefined
      if (completed) {
        collected.push(...repo.completedMetrics(completed.id))
        coverage.consulted.push(item.provider)
        continue
      }
      if (queriesExecuted >= limits.maxQueries || Date.now() >= deadline) {
        attemptedSkip = true; coverage.skipped.push({ provider: item.provider, reason: "Research limit reached." }); continue
      }
      const estimate = connector.estimate(query)
      if (estimate === null || (item.provider === "alura" && creditsEstimated + estimate > limits.maxCreditsAlura) ||
          (item.provider === "everbee" && everBeeRequests + estimate > limits.maxEverBeeRequests) ||
          (item.provider === "etsy" && etsyRequests + estimate > limits.maxEtsyRequests)) {
        attemptedSkip = true; coverage.skipped.push({ provider: item.provider, reason: "Unknown or exceeded pre-call credit budget." }); continue
      }
      const call = repo.prepareCall({ runId: started.id, owner, provider: item.provider,
        capability: query.capability, hash: queryHash, query })
      if (call.state === "UNKNOWN" || call.state === "IN_FLIGHT") {
        attemptedSkip = true
        outcomeUnknown = true
        coverage.skipped.push({ provider: item.provider, reason: "Previous external call outcome requires review." })
        break
      }
      if (call.state === "COMPLETED") {
        collected.push(...repo.completedMetrics(call.id))
        coverage.consulted.push(item.provider)
        continue
      }
      const cached = repo.cacheGet(queryHash)
      let result = cached
      if (!result) {
        let dispatched = false
        try {
          if (item.provider === "alura" && aluraSafety) await aluraSafety.beforeCall(call.id, estimate)
          repo.startCall(call.id)
          dispatched = true
          queriesExecuted++
          if (item.provider === "alura") creditsEstimated += estimate
          if (item.provider === "everbee") everBeeRequests += estimate
          if (item.provider === "etsy") etsyRequests += estimate
          result = await connector.query(query)
          const ids = repo.completeCall({ callId: call.id, runId: started.id, investigationId,
            provider: item.provider, capability: query.capability, hash: queryHash,
            estimated: estimate, result, cache: true })
          collected.push(...result.metrics.map((metric, index) => ({ metric, evidenceId: ids[index] })))
          if (item.provider === "alura" && aluraSafety) aluraSafety.afterCall(call.id, result.creditsReported)
          if (item.provider === "alura") {
            if (result.creditsReported === undefined) reportedKnown = false
            else creditsReported += result.creditsReported
          }
        } catch {
          attemptedSkip = true
          if (dispatched) {
            outcomeUnknown = true
            repo.markUnknown(call.id)
            repo.recordQuery({ runId: started.id, provider: item.provider, capability: query.capability,
              hash: queryHash, status: "FAILED", estimated: estimate, error: "External call outcome unknown." })
            coverage.skipped.push({ provider: item.provider, reason: "External call outcome unknown; manual review required." })
            break
          }
          coverage.skipped.push({ provider: item.provider, reason: "Pre-call authorization, balance or retention check blocked this query." })
          continue
        }
      } else {
        const ids = repo.completeCall({ callId: call.id, runId: started.id, investigationId,
          provider: item.provider, capability: query.capability, hash: queryHash,
          estimated: 0, result, cache: false })
        collected.push(...result.metrics.map((metric, index) => ({ metric, evidenceId: ids[index] })))
      }
      coverage.consulted.push(item.provider)
      coverage.warnings.push(...result.warnings)
    }
    coverage.discrepancies = compareMarketMetrics(collected.map((item) => item.metric))
    const requested = request.toLowerCase()
    const requiredGroups: Array<[RegExp, RegExp]> = [
      [/ventas|sales|ingresos|revenue/, /sales|revenue/],
      [/crecimiento|growth|tendencia|trend|estacional|seasonal/, /trend|change|growth/],
      [/competencia|competition/, /competition|competing_listings/],
    ]
    const missingMetrics = requiredGroups.filter(([intent, metric]) => intent.test(requested) &&
      !collected.some((item) => metric.test(item.metric.metric))).map(([intent]) => intent.source)
    if (missingMetrics.length) coverage.warnings.push(`Insufficient evidence for requested metrics: ${missingMetrics.join(", ")}.`)
    const bySubject = new Map<string, typeof collected>()
    for (const item of collected) {
      const key = item.metric.subject.trim().toLowerCase()
      bySubject.set(key, [...(bySubject.get(key) || []), item])
    }
    for (const [subject, items] of (missingMetrics.length ? [] : [...bySubject].slice(0, 5))) {
      const metrics = new Set(items.map((item) => item.metric.metric))
      if (!metrics.size) continue
      const rationale = `Evidence for ${subject} from ${[...new Set(items.map((item) => item.metric.provider))].join(" and ")}. ` +
        "Figures retain their own provider, measurement period and uncertainty; no sales outcome is guaranteed."
      const exists = db.prepare("SELECT 1 FROM research_opportunities WHERE investigation_id=? AND title=? LIMIT 1")
        .get(investigationId, subject)
      if (!exists) repo.addOpportunity(investigationId, subject, rationale, [...new Set(items.map((item) => item.evidenceId))])
    }
    if (outcomeUnknown) {
      repo.markNeedsReview(started.id, "External request outcome unknown; no automatic paid retry.")
      return { ...repo.getInvestigation(investigationId), cached: false }
    }
    if (repo.cancellationRequested(started.id)) {
      db.prepare("UPDATE research_runs SET recovery_state='CANCELLED' WHERE id=?").run(started.id)
      repo.finish(started.id, "PARTIAL", coverage, { creditsEstimated, creditsReported: reportedKnown ? creditsReported : null,
        everBeeRequests, etsyRequests, queriesExecuted, plannerUsage: plan.usage })
      return { ...repo.getInvestigation(investigationId), cached: false }
    }
    const status = collected.length === 0 || missingMetrics.length ? "INSUFFICIENT" : attemptedSkip ? "PARTIAL" : "COMPLETED"
    repo.finish(started.id, status, coverage, { creditsEstimated, creditsReported: reportedKnown ? creditsReported : null, everBeeRequests, etsyRequests,
      queriesExecuted, plannerUsage: plan.usage })
    return { ...repo.getInvestigation(investigationId), cached: false }
  } catch {
    repo.finish(started.id, "FAILED", coverage, { creditsEstimated, creditsReported: reportedKnown ? creditsReported : null, everBeeRequests, etsyRequests,
      queriesExecuted }, "Research execution failed.")
    throw new Error("Research execution failed; partial evidence, if any, remains available.")
  }
}
