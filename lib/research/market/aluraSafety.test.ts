import { afterEach, describe, expect, it, vi } from "vitest"
import type Database from "better-sqlite3"
import { openAutomationDatabase } from "../../automation/db/database"
import { ResearchRepository } from "../repository"
import { MarketResearchRepository } from "./repository"
import { aluraBudgetStatus, maintenanceIsHealthy, reserveAluraCredits, settleAluraCredits } from "./aluraBudget"
import { fetchAluraUsage, recordAluraDiagnostic } from "./aluraUsage"
import { marketDiagnostics } from "./diagnostics"
import { runResearchRetention } from "../../../scripts/research-retention.mjs"

describe("Alura local safety", () => {
  let db: Database.Database
  afterEach(() => db?.close())
  function setup() {
    db = openAutomationDatabase(":memory:")
    const investigation = new ResearchRepository(db).createInvestigation({
      title: "Test", mode: "open", query: "botanical art", suggestedProductType: null,
    })
    const repo = new MarketResearchRepository(db)
    const run = repo.claim(investigation.id, "hash", "owner")
    repo.savePlan(run.id, "owner", { objective: "test", terms: [], queries: [], missing: [], model: null, usage: null })
    const call = repo.prepareCall({ runId: run.id, owner: "owner", provider: "alura", capability: "keywords",
      hash: "query", query: { capability: "keywords", term: "botanical art", limit: 1 } })
    return call.id
  }

  it("blocks requests with no independent maintenance heartbeat", () => {
    const callId = setup()
    expect(() => reserveAluraCredits(db, callId, 1, 70)).toThrow("maintenance")
    expect(aluraBudgetStatus(db).reserved).toBe(0)
  })

  it("detects missed maintenance after restart and recovers with a new worker pass", () => {
    const callId = setup()
    const now = new Date("2026-10-27T12:00:00Z")
    runResearchRetention(db, new Date(now.getTime() - 11 * 60000), "worker")
    expect(maintenanceIsHealthy(db, now)).toBe(false)
    expect(() => reserveAluraCredits(db, callId, 1, 70, now)).toThrow("maintenance")
    runResearchRetention(db, now, "worker")
    expect(maintenanceIsHealthy(db, now)).toBe(true)
    expect(reserveAluraCredits(db, callId, 1, 70, now).remainingAfterCall).toBe(69)
  })

  it("enforces 30 cumulative credits and the 40-credit reserve", () => {
    const callId = setup()
    runResearchRetention(db, new Date(), "worker")
    expect(() => reserveAluraCredits(db, callId, 10, 45)).toThrow("reserve")
    reserveAluraCredits(db, callId, 10, 70)
    expect(() => reserveAluraCredits(db, callId, 1, 70)).toThrow("eligible")
    db.prepare("UPDATE research_call_ledger SET state='COMPLETED' WHERE id=?").run(callId)
    settleAluraCredits(db, callId, 10)
    expect(aluraBudgetStatus(db)).toMatchObject({ spent: 10, reserved: 0, maintenanceHealthy: true })
    const other = new MarketResearchRepository(db).claim(
      (db.prepare("SELECT id FROM research_investigations LIMIT 1").get() as { id: string }).id, "other", "owner")
    new MarketResearchRepository(db).savePlan(other.id, "owner", {
      objective: "test", terms: [], queries: [], missing: [], model: null, usage: null,
    })
    const next = new MarketResearchRepository(db).prepareCall({ runId: other.id, owner: "owner", provider: "alura",
      capability: "products", hash: "next", query: { capability: "products", term: "art", limit: 1 } })
    expect(() => reserveAluraCredits(db, next.id, 21, 70)).toThrow("budget")
  })

  it("handles missing credentials, invalid scopes and incomplete account responses without leaking secrets", async () => {
    const key = "test-secret-never-log"
    const noKey = vi.fn(async () => new Response(null, { status: 401 }))
    expect((await fetchAluraUsage(key, noKey as typeof fetch)).state).toBe("NOT_AUTHORIZED")
    const missing = vi.fn(async () => new Response(JSON.stringify({ credits: {} }), { status: 200 }))
    const invalid = await fetchAluraUsage(key, missing as typeof fetch)
    expect(invalid.state).toBe("DEGRADED")
    const callId = setup()
    recordAluraDiagnostic(db, invalid)
    expect(db.prepare("SELECT error_code FROM research_alura_diagnostics LIMIT 1").get())
      .toEqual({ error_code: "invalid_usage_response" })
    expect(JSON.stringify(db.prepare("SELECT * FROM research_alura_diagnostics").all())).not.toContain(key)
    expect(() => reserveAluraCredits(db, callId, 1, Number.NaN)).toThrow("unknown")
  })

  it("parses free usage balance and reported zero-credit cost", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ plan: "free", credits: {
      allowance: 100, used: 30, remaining: 70 }, daily: null,
    rate_limit: { requests_per_minute: 30 } }), { status: 200, headers: { "Alura-Credits-Cost": "0" } }))
    const result = await fetchAluraUsage("mock-key", fetcher as typeof fetch)
    expect(result).toMatchObject({ state: "AVAILABLE", creditsCost: 0,
      usage: { credits: { remaining: 70 } } })
    expect(fetcher).toHaveBeenCalledTimes(1)
    setup()
    recordAluraDiagnostic(db, result)
    const diagnostics = marketDiagnostics(db, [{ provider: "alura", status: () => ({
      provider: "alura", state: "AVAILABLE", capabilities: ["keywords"] }),
    estimate: () => 1, query: async () => ({ metrics: [], warnings: [] }) }])
    expect(diagnostics[0].state).toBe("USAGE_VERIFIED")
  })

  it("removes provider evidence at its 23-hour deadline without web traffic", () => {
    setup()
    const investigationId = (db.prepare("SELECT id FROM research_investigations LIMIT 1").get() as { id: string }).id
    const repo = new MarketResearchRepository(db)
    const ids = repo.recordEvidence(investigationId, [{ provider: "alura", sourceId: "sample",
      sourceUrl: "https://api.alura.io/v1/research/keywords/sample", capturedAt: "2026-10-27T12:00:00Z",
      period: "2026-10", metric: "etsy_monthly_searches", unit: "searches/month", value: 10,
      nature: "estimated", subject: "botanical art" }])
    db.prepare("UPDATE research_evidence SET expires_at=? WHERE id=?").run("2026-10-28T11:00:00Z", ids[0])
    runResearchRetention(db, new Date("2026-10-28T10:59:59Z"), "worker")
    expect(db.prepare("SELECT id FROM research_evidence WHERE id=?").get(ids[0])).toBeDefined()
    runResearchRetention(db, new Date("2026-10-28T11:00:01Z"), "worker")
    expect(db.prepare("SELECT id FROM research_evidence WHERE id=?").get(ids[0])).toBeUndefined()
  })

  it("expires account diagnostics without erasing locally tracked test spend", () => {
    setup()
    db.prepare(`INSERT INTO research_alura_diagnostics
      (id,checked_at,state,plan,credits_remaining) VALUES ('old','2026-10-27T12:00:00Z','AVAILABLE','free',70)`).run()
    db.prepare(`INSERT INTO research_alura_budget (month,spent_credits,reserved_credits,updated_at)
      VALUES ('stage4_2_test',1,0,'2026-10-27T12:00:00Z')`).run()
    runResearchRetention(db, new Date("2026-10-28T11:01:00Z"), "worker")
    expect(db.prepare("SELECT id FROM research_alura_diagnostics WHERE id='old'").get()).toBeUndefined()
    expect(aluraBudgetStatus(db).spent).toBe(1)
  })
})
