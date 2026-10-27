import { afterEach, describe, expect, it } from "vitest"
import type Database from "better-sqlite3"
import { openAutomationDatabase } from "../../automation/db/database"
import { ResearchRepository } from "../repository"
import { MarketResearchRepository } from "./repository"
import { getProviderPolicy, providerExpiry } from "./providerPolicies.mjs"
import { runResearchRetention } from "../../../scripts/research-retention.mjs"
import type { MarketMetric } from "./contracts"

describe("provider policies and own knowledge", () => {
  let db: Database.Database
  afterEach(() => db?.close())
  function setup() {
    db = openAutomationDatabase(":memory:")
    const id = new ResearchRepository(db).createInvestigation({
      title: "Policy test", query: "art", mode: "open", suggestedProductType: null,
    }).id
    return { id, repo: new MarketResearchRepository(db) }
  }
  function metric(provider: MarketMetric["provider"]): MarketMetric {
    return { provider, sourceId: provider, sourceUrl: "https://example.com", capturedAt: new Date().toISOString(),
      period: "2026-10", metric: "count", unit: "items", value: 1, nature: "observed", subject: "art" }
  }
  it("does not invent deadlines for pending providers", () => {
    expect(getProviderPolicy("everbee").evidenceHours).toBeNull()
    expect(getProviderPolicy("google_trends").evidenceHours).toBeNull()
    expect(() => providerExpiry("everbee")).toThrow("pending")
  })
  it("keeps other providers and confirmed original knowledge when Alura evidence expires", () => {
    const { id, repo } = setup()
    const alura = repo.recordEvidence(id, [metric("alura")])[0]
    const etsy = repo.recordEvidence(id, [metric("etsy")])[0]
    const own = repo.addKnowledge({ investigationId: id, kind: "conclusion", title: "My hypothesis",
      content: "A new concept to test", author: "owner", originalConfirmed: true, evidenceIds: [alura] })
    db.prepare("UPDATE research_evidence SET expires_at='2000-01-01T00:00:00Z' WHERE id=?").run(alura)
    runResearchRetention(db)
    expect(db.prepare("SELECT id FROM research_evidence WHERE id=?").get(alura)).toBeUndefined()
    expect(db.prepare("SELECT id FROM research_evidence WHERE id=?").get(etsy)).toBeDefined()
    expect(db.prepare("SELECT id FROM research_knowledge WHERE id=?").get(own)).toBeDefined()
    expect(db.prepare("SELECT provider FROM research_knowledge_provenance WHERE knowledge_id=?").get(own))
      .toEqual({ provider: "alura" })
  })
  it("expires automatic multi-source knowledge at the earliest provider deadline", () => {
    const { id, repo } = setup()
    const a = repo.recordEvidence(id, [metric("alura")])[0], e = repo.recordEvidence(id, [metric("etsy")])[0]
    const knowledge = repo.addKnowledge({ investigationId: id, kind: "brief", title: "Derived",
      content: "Derived from both", author: "system", originalConfirmed: false, evidenceIds: [a, e] })
    const row = db.prepare("SELECT expires_at FROM research_knowledge WHERE id=?").get(knowledge) as { expires_at: string }
    const etsyExpiry = db.prepare("SELECT expires_at FROM research_evidence WHERE id=?").get(e) as { expires_at: string }
    expect(row.expires_at).toBe(etsyExpiry.expires_at)
    expect(db.prepare("SELECT provider FROM research_knowledge_provenance WHERE knowledge_id=? ORDER BY provider").all(knowledge))
      .toEqual([{ provider: "alura" }, { provider: "etsy" }])
    expect(() => repo.addKnowledge({ investigationId: id, kind: "brief", title: "Unsafe", content: "Unsafe",
      author: "owner", originalConfirmed: true, evidenceIds: [e] })).toThrow("not confirmed")
  })
})
