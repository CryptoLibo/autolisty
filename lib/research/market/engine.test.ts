import { afterEach, describe, expect, it, vi } from "vitest"
import type Database from "better-sqlite3"
import { openAutomationDatabase } from "../../automation/db/database"
import { ResearchRepository } from "../repository"
import { AluraConnector } from "./alura"
import { EverBeeConnector } from "./everbee"
import { EtsyMarketConnector } from "./etsy"
import { fetchMarketPage } from "./http"
import { executeMarketResearch } from "./engine"
import { MarketResearchRepository } from "./repository"
import { runResearchRetention } from "../../../scripts/research-retention.mjs"
import { marketDiagnostics } from "./diagnostics"
import type { MarketConnector, MarketMetric, MarketQuery } from "./contracts"
import type { Planner } from "./plan"

function metric(provider: MarketMetric["provider"], subject = "botanical print"): MarketMetric {
  return { provider, sourceId: "sample-1", sourceUrl: "https://example.com/source", capturedAt: "2026-10-25T10:00:00Z",
    period: "2026-09", metric: "estimated_monthly_sales", unit: "sales/month", value: 24,
    nature: "estimated", subject, uncertainty: "Provider estimate" }
}

function connector(provider: "alura" | "everbee", result = metric(provider), state: "AVAILABLE" | "UNAVAILABLE" = "AVAILABLE"): MarketConnector {
  return { provider, status: () => ({ provider, state, capabilities: state === "AVAILABLE" ? ["products"] : [] }),
    estimate: () => provider === "alura" ? 10 : 1,
    query: vi.fn(async () => ({ metrics: [result], warnings: [], creditsReported: provider === "alura" ? 10 : undefined })) }
}

describe("market research engine", () => {
  let db: Database.Database
  afterEach(() => db?.close())
  function setup(query = "botanical print") {
    db = openAutomationDatabase(":memory:")
    return new ResearchRepository(db).createInvestigation({ title: "Test", query, mode: "open", suggestedProductType: null }).id
  }
  const plan = (items: Array<{ provider: string; query: MarketQuery }>): Planner => vi.fn(async () => ({ objective: "research",
    terms: items.map((item) => item.query.term), queries: items, missing: [], model: "mock", usage: { inputTokens: 1, outputTokens: 1 } }))
  const q = (term = "botanical print") => ({ capability: "products" as const, term, limit: 10 })

  it("permits open research without product or niche and reports insufficient data", async () => {
    const id = setup("")
    const result = await executeMarketResearch(db, id, "Find opportunities", [], plan([]))
    expect((result.runs[0] as { status: string }).status).toBe("INSUFFICIENT")
    expect(result.opportunities).toHaveLength(0)
  })

  it("combines two permitted providers without averaging incompatible estimates", async () => {
    const id = setup(), a = connector("alura")
    const b: MarketConnector = { provider: "etsy",
      status: () => ({ provider: "etsy", state: "AVAILABLE", capabilities: ["products"] }),
      estimate: () => 1, query: vi.fn(async () => ({ metrics: [{ ...metric("etsy"), value: 31 }], warnings: [] })) }
    const result = await executeMarketResearch(db, id, "Compare botanical print", [a, b], plan([
      { provider: "alura", query: q() }, { provider: "etsy", query: q() }]))
    expect(result.evidence).toHaveLength(2)
    expect(result.opportunities).toHaveLength(1)
    const coverage = JSON.parse((result.runs[0] as { coverage_json: string }).coverage_json)
    expect(coverage.discrepancies).toHaveLength(1)
    expect(coverage.consulted).toEqual(["alura", "etsy"])
  })

  it("does not invent evidence when a provider is unavailable", async () => {
    const id = setup(), a = connector("alura", metric("alura"), "UNAVAILABLE")
    const result = await executeMarketResearch(db, id, "botanical print", [a], plan([{ provider: "alura", query: q() }]))
    expect(a.query).not.toHaveBeenCalled()
    expect(result.evidence).toHaveLength(0)
    expect((result.runs[0] as { status: string }).status).toBe("INSUFFICIENT")
  })

  it("keeps partial results when a second source fails", async () => {
    const id = setup(), a = connector("alura")
    const b: MarketConnector = { provider: "etsy",
      status: () => ({ provider: "etsy", state: "AVAILABLE", capabilities: ["products"] }),
      estimate: () => 1, query: vi.fn(async () => { throw new Error("failed") }) }
    const result = await executeMarketResearch(db, id, "botanical print", [a, b], plan([
      { provider: "alura", query: q() }, { provider: "etsy", query: q() }]))
    expect((result.runs[0] as { status: string }).status).toBe("PARTIAL")
    expect(result.evidence).toHaveLength(1)
    expect((result.runs[0] as { recovery_state: string }).recovery_state).toBe("NEEDS_REVIEW")
    const again = await executeMarketResearch(db, id, "botanical print", [a, b], plan([
      { provider: "alura", query: q() }, { provider: "etsy", query: q() }]))
    expect(again.cached).toBe(true)
    expect(b.query).toHaveBeenCalledTimes(1)
  })

  it("recovers a prepared call but quarantines an interrupted external request", () => {
    const id = setup(), repo = new MarketResearchRepository(db)
    const claimed = repo.claim(id, "recovery-test", "test-worker")
    expect(claimed.claimed).toBe(true)
    const call = repo.prepareCall({ runId: claimed.id, owner: "test-worker", provider: "alura",
      capability: "products", hash: "first", query: q() })
    db.prepare("UPDATE research_runs SET lease_expires_at='2000-01-01T00:00:00Z' WHERE id=?").run(claimed.id)
    expect(repo.recoverInterrupted().review).toBe(1) // The planner was not persisted.
    expect(db.prepare("SELECT state FROM research_call_ledger WHERE id=?").get(call.id)).toEqual({ state: "PREPARED" })
    const next = repo.claim(id, "second", "test-worker")
    repo.savePlan(next.id, "test-worker", { objective: "test", terms: [], queries: [], missing: [], model: null, usage: null })
    const dispatched = repo.prepareCall({ runId: next.id, owner: "test-worker", provider: "alura",
      capability: "products", hash: "second", query: q() })
    repo.startCall(dispatched.id)
    db.prepare("UPDATE research_runs SET lease_expires_at='2000-01-01T00:00:00Z' WHERE id=?").run(next.id)
    expect(repo.recoverInterrupted().review).toBe(1)
    expect(db.prepare("SELECT state FROM research_call_ledger WHERE id=?").get(dispatched.id)).toEqual({ state: "UNKNOWN" })
  })

  it("cancels an idle run without dispatching a paid call", async () => {
    const id = setup(), repo = new MarketResearchRepository(db), a = connector("alura")
    const planner: Planner = async () => {
      const run = db.prepare("SELECT id FROM research_runs WHERE investigation_id=?").get(id) as { id: string }
      expect(repo.cancel(run.id)).toBe("CANCEL_REQUESTED")
      return { objective: "test", terms: [], queries: [{ provider: "alura", query: q() }],
        missing: [], model: null, usage: null }
    }
    const result = await executeMarketResearch(db, id, "botanical print", [a], planner)
    expect(a.query).not.toHaveBeenCalled()
    expect((result.runs[0] as { recovery_state: string }).recovery_state).toBe("CANCELLED")
  })

  it("scrubs expired Alura evidence, linked opportunity and cached response", () => {
    const id = setup(), repo = new MarketResearchRepository(db)
    const evidence = repo.recordEvidence(id, [metric("alura")])
    const opportunity = repo.addOpportunity(id, "From Alura", "Provider data", evidence)
    repo.cachePut("cache-test", "alura", { metrics: [metric("alura")], warnings: [] })
    db.prepare("UPDATE research_evidence SET expires_at='2000-01-01T00:00:00Z'").run()
    db.prepare("UPDATE research_opportunities SET retention_expires_at='2000-01-01T00:00:00Z' WHERE id=?").run(opportunity)
    db.prepare("UPDATE research_query_cache SET expires_at='2000-01-01T00:00:00Z'").run()
    runResearchRetention(db)
    expect(db.prepare("SELECT id FROM research_evidence WHERE id=?").get(evidence[0])).toBeUndefined()
    expect(db.prepare("SELECT title,status FROM research_opportunities WHERE id=?").get(opportunity))
      .toEqual({ title: "Expired provider evidence", status: "EXPIRED" })
    expect(db.prepare("SELECT query_hash FROM research_query_cache WHERE query_hash='cache-test'").get()).toBeUndefined()
  })

  it("does not label configured but unverified providers as available", () => {
    setup()
    expect(marketDiagnostics(db, [connector("alura")])[0].state).toBe("NOT_AUTHORIZED")
  })

  it("does not substitute Etsy favorites for requested sales", async () => {
    const id = setup()
    const etsy: MarketConnector = { provider: "etsy",
      status: () => ({ provider: "etsy", state: "AVAILABLE", capabilities: ["products"] }),
      estimate: () => 1, query: vi.fn(async () => ({ metrics: [{ ...metric("etsy"),
        metric: "listing_favorites", unit: "favorites", nature: "observed" as const }], warnings: [] })) }
    const result = await executeMarketResearch(db, id, "Find sales for botanical print", [etsy],
      plan([{ provider: "etsy", query: q() }]))
    expect((result.runs[0] as { status: string }).status).toBe("INSUFFICIENT")
    expect(result.opportunities).toHaveLength(0)
  })

  it("enforces credits and query counts before calls", async () => {
    const id = setup(), a = connector("alura")
    const result = await executeMarketResearch(db, id, "botanical print", [a], plan([
      { provider: "alura", query: q() }, { provider: "alura", query: q("floral print") }]),
    { maxQueries: 1, maxCreditsAlura: 10, maxEverBeeRequests: 1, maxEtsyRequests: 1, maxDurationMs: 30000 })
    expect(a.query).toHaveBeenCalledTimes(1)
    expect((result.runs[0] as { status: string }).status).toBe("PARTIAL")
  })

  it("reuses a saved investigation and avoids repeat provider calls", async () => {
    const id = setup(), a = connector("alura"), planner = plan([{ provider: "alura", query: q() }])
    await executeMarketResearch(db, id, "botanical print", [a], planner)
    const second = await executeMarketResearch(db, id, "botanical print", [a], planner)
    expect(second.cached).toBe(true)
    expect(a.query).toHaveBeenCalledTimes(1)
    expect(planner).toHaveBeenCalledTimes(1)
  })

  it("allows an explicit fresh research run", async () => {
    const id = setup(), a = connector("alura"), planner = plan([{ provider: "alura", query: q() }])
    await executeMarketResearch(db, id, "botanical print", [a], planner)
    const fresh = await executeMarketResearch(db, id, "botanical print", [a], planner, undefined, true)
    expect(fresh.cached).toBe(false)
    expect(fresh.runs).toHaveLength(2)
    expect(a.query).toHaveBeenCalledTimes(1)
  })

  it("supports selecting multiple opportunities", async () => {
    const id = setup(), repo = new MarketResearchRepository(db)
    const evidence = repo.recordEvidence(id, [metric("alura", "botanical"), metric("alura", "coastal")])
    const first = repo.addOpportunity(id, "Botanical", "Owner conclusion", [evidence[0]])
    const second = repo.addOpportunity(id, "Coastal", "Owner conclusion", [evidence[1]])
    repo.selectOpportunity(first, true); repo.selectOpportunity(second, true)
    expect(repo.getInvestigation(id).opportunities.filter((item) => item.selected)).toHaveLength(2)
  })

  it("purges Alura data after the documented retention window", () => {
    const id = setup(), repo = new MarketResearchRepository(db)
    repo.recordEvidence(id, [metric("alura")])
    db.prepare("UPDATE research_evidence SET expires_at='2000-01-01T00:00:00Z'").run()
    expect(repo.getInvestigation(id).evidence).toHaveLength(0)
    expect(db.prepare("SELECT id FROM research_sources WHERE provider='alura'").all()).toHaveLength(0)
  })
})

describe("Alura connector normalization", () => {
  it("uses documented keyword fields and preserves null as unknown", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "7", keyword: "leaf print",
      volume: { etsy_monthly: null }, competition: { competing_listings: 12 }, trend: { change_3m: 0.1 } }], pending: [], unfetched: [] }),
      { status: 200, headers: { "Alura-Credits-Cost": "1" } }))
    const alura = new AluraConnector("test-key", true, fetcher as typeof fetch)
    const result = await alura.query({ capability: "keywords", term: "leaf print", limit: 10 })
    expect(result.metrics.map((item) => item.metric)).toEqual(["competing_listings", "etsy_search_change_3m"])
    expect(result.creditsReported).toBe(1)
    expect(String((fetcher as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain("/v1/research/keywords")
  })

  it("supports open discovery through one bounded trending page", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "12", title: "Fern Pattern",
      sales: { est_last_month: 30, est_trend_3m: 0.2 } }],
      summary: { trend_window: { from: "2026-04", to: "2026-09" } } }), { status: 200 }))
    const alura = new AluraConnector("test-key", true, fetcher as typeof fetch)
    const result = await alura.query({ capability: "trending", term: "", limit: 10 })
    expect(result.metrics.some((item) => item.metric === "estimated_sales_trend_3m" && item.period === "2026-04..2026-09")).toBe(true)
    expect(String((fetcher as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain("/products/trending")
  })

  it("blocks live calls without explicit enablement", async () => {
    const fetcher = vi.fn()
    const alura = new AluraConnector("test-key", false, fetcher as typeof fetch)
    await expect(alura.query({ capability: "products", term: "art", limit: 10 })).rejects.toThrow("unavailable")
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("normalizes EverBee keyword analytics only after approval", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ results: [{ _id: "k1", keyword: "fern wall art",
      vol: 50, competition: 9, new_volume: 20, score: 11 }], total_pages: 1 }), { status: 200 }))
    const blocked = new EverBeeConnector("id", "secret", true, false, fetcher as typeof fetch)
    expect(blocked.status().state).toBe("NOT_AUTHORIZED")
    const connector = new EverBeeConnector("id", "secret", true, true, fetcher as typeof fetch)
    const result = await connector.query({ capability: "keywords", term: "fern wall art", limit: 10 })
    expect(result.metrics).toHaveLength(4)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("never invents Etsy competitor sales", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ results: [{ listing_id: 12,
      title: "Fern Print", num_favorers: 7 }] }), { status: 200 }))
    const connector = new EtsyMarketConnector("key:secret", true, fetcher as typeof fetch)
    const result = await connector.query({ capability: "products", term: "fern print", limit: 10 })
    expect(result.metrics.map((item) => item.metric)).toEqual(["listing_favorites"])
  })

  it("retries a rate-limited request at most once", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": "0" } }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
    const response = await fetchMarketPage(new URL("https://api.alura.io/v1/usage"), {}, fetcher)
    expect(response.status).toBe(200)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
