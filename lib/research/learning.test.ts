import { afterEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { openAutomationDatabase } from "../automation/db/database"
import { runAutomationMigrations } from "../automation/db/migrations"
import { ResearchRepository } from "./repository"
import { CreativeRepository } from "./creativeRepository"
import { LearningRepository } from "./learning"

describe("research learning and lineage", () => {
  let database: Database.Database | null = null
  afterEach(() => { database?.close(); database = null })

  function learning() {
    database = openAutomationDatabase(":memory:")
    return new LearningRepository(database)
  }

  it("applies an explicit correction immediately", () => {
    const repo = learning()
    const saved = repo.createCorrection({ text: "Prefer warm contrast", scope: "general" })
    expect(saved.rule.status).toBe("ACTIVE")
    expect(repo.getApplicableRules({}).rules.map((rule) => rule.id)).toContain(saved.rule.id)
  })

  it("isolates Vertical Wall Art from other products", () => {
    const repo = learning()
    repo.createCorrection({ text: "Use tall subject framing", scope: "product", scopeKey: "vertical_wall_art" })
    expect(repo.getApplicableRules({ productType: "vertical_wall_art" }).rules).toHaveLength(1)
    expect(repo.getApplicableRules({ productType: "frame_tv_art" }).rules).toHaveLength(0)
  })

  it("applies general rules in both contexts", () => {
    const repo = learning()
    repo.createCorrection({ text: "Check spelling", scope: "general" })
    expect(repo.getApplicableRules({ productType: "png_designs" }).rules).toHaveLength(1)
    expect(repo.getApplicableRules({ productType: "frame_tv_art" }).rules).toHaveLength(1)
  })

  it("flags contradictory same-scope rules without activating the second", () => {
    const repo = learning()
    repo.createCorrection({ text: "Use gold", scope: "general", conflictKey: "gold", instruction: "Use gold" })
    const second = repo.createCorrection({ text: "Avoid gold", scope: "general", conflictKey: "gold", instruction: "Avoid gold" })
    expect(second.rule.status).toBe("CONFLICT")
    expect(second.conflicts).toHaveLength(1)
    expect(repo.getApplicableRules({}).rules).toHaveLength(1)
  })

  it("uses a specific rule over a general one and reports the disagreement", () => {
    const repo = learning()
    const general = repo.createCorrection({ text: "Use gold", scope: "general", conflictKey: "gold" })
    const specific = repo.createCorrection({ text: "Avoid gold", scope: "product", scopeKey: "vertical_wall_art", conflictKey: "gold" })
    const result = repo.getApplicableRules({ productType: "vertical_wall_art" })
    expect(result.rules.map((rule) => rule.id)).toEqual([specific.rule.id])
    expect(result.contradictions).toEqual([{ selectedRuleId: specific.rule.id, overriddenRuleId: general.rule.id }])
  })

  it("deactivation takes effect on the next retrieval and preserves history", () => {
    const repo = learning()
    const saved = repo.createCorrection({ text: "Use fine lines", scope: "general" })
    repo.updateCorrection(saved.rule.id, { expectedVersion: 1, status: "INACTIVE" })
    expect(repo.getApplicableRules({}).rules).toHaveLength(0)
    expect(repo.getHistory(saved.rule.id)).toHaveLength(2)
  })

  it("keeps ambiguous scope proposed until confirmation", () => {
    const repo = learning()
    const saved = repo.createCorrection({ text: "This one needs bigger text" })
    expect(saved.rule.status).toBe("PROPOSED")
    expect(repo.getApplicableRules({}).rules).toHaveLength(0)
    repo.updateCorrection(saved.rule.id, { expectedVersion: 1, scope: "design", scopeKey: "design:abc", status: "ACTIVE" })
    expect(repo.getApplicableRules({ designId: "abc" }).rules).toHaveLength(1)
    expect(repo.getApplicableRules({ designId: "xyz" }).rules).toHaveLength(0)
  })

  it("supports many concepts and products from one investigation", () => {
    database = openAutomationDatabase(":memory:")
    const research = new ResearchRepository(database)
    const creative = new CreativeRepository(database)
    const investigation = research.createInvestigation({ title: "Autumn", mode: "open", query: "", suggestedProductType: null })
    const opportunity = creative.createOpportunity(investigation.id, "Botanical")
    const a = creative.createConcept({ investigationId: investigation.id, opportunityId: opportunity, title: "Gold leaves" })
    creative.createConcept({ investigationId: investigation.id, opportunityId: opportunity, title: "Ink leaves" })
    expect(creative.listConcepts(investigation.id)).toHaveLength(2)
    const prompt = creative.savePromptVersion({ conceptId: a, text: "Leaves in gold", origin: "research" })
    const project = creative.createProject(investigation.id, "Autumn art")
    const design = creative.createDesign({ projectId: project, conceptId: a, promptId: prompt.promptId, promptRevision: 1 })
    const first = creative.createGenerationConfig({ designId: design, productType: "vertical_wall_art", provider: "pending" })
    const second = creative.createGenerationConfig({ designId: design, productType: "frame_tv_art", provider: "pending" })
    const base = { designId: design, conceptId: a, promptId: prompt.promptId, promptRevision: 1 }
    expect(creative.createGenerationJob({ ...base, configId: first, idempotencyKey: "first" })).not.toBe(
      creative.createGenerationJob({ ...base, configId: second, idempotencyKey: "second" })
    )
  })

  it("retains prompt revisions without rewriting prior text", () => {
    database = openAutomationDatabase(":memory:")
    const research = new ResearchRepository(database)
    const creative = new CreativeRepository(database)
    const investigation = research.createInvestigation({ title: "A", mode: "open", query: "", suggestedProductType: null })
    const opportunity = creative.createOpportunity(investigation.id, "B")
    const concept = creative.createConcept({ investigationId: investigation.id, opportunityId: opportunity, title: "C" })
    const first = creative.savePromptVersion({ conceptId: concept, text: "Old", origin: "owner" })
    const next = creative.savePromptVersion({ conceptId: concept, promptId: first.promptId, text: "New", origin: "owner" })
    expect(next.revision).toBe(2)
    expect(creative.listPromptVersions(concept).map((item) => item.creative_text)).toEqual(["Old", "New"])
  })

  it("reads relevant indexed scope and honors a bounded memory budget", () => {
    const repo = learning()
    for (let index = 0; index < 30; index += 1) {
      repo.createCorrection({ text: `Unrelated niche ${index}`, scope: "niche", scopeKey: `other-${index}` })
    }
    const relevant = repo.createCorrection({ text: "Keep lettering legible", scope: "niche", scopeKey: "botanical" })
    const result = repo.getApplicableRules({ niche: "botanical", investigationId: "unused", modality: "variations" }, { maxMemoryTokens: 100, runId: "run-1" })
    expect(result.rules.map((rule) => rule.id)).toEqual([relevant.rule.id])
    expect(result.estimatedTokens).toBeLessThanOrEqual(100)
    expect((database!.prepare("SELECT COUNT(*) AS total FROM creative_rule_uses WHERE run_id='run-1'").get() as { total: number }).total).toBe(1)
  })

  it("keeps v4 data during incremental migration to v5", () => {
    database = new Database(":memory:")
    database.pragma("foreign_keys = ON")
    runAutomationMigrations(database, 4)
    database.prepare(`INSERT INTO research_investigations (id,title,mode,query,created_at,updated_at) VALUES ('old','Before','open','','2026-01-01','2026-01-01')`).run()
    runAutomationMigrations(database)
    expect((database.prepare("SELECT title FROM research_investigations WHERE id='old'").get() as { title: string }).title).toBe("Before")
    expect((database.pragma("user_version", { simple: true }) as number)).toBe(10)
  })

  it("deduplicates repeated writes and retrying generation work", () => {
    const repo = learning()
    const first = repo.createCorrection({ text: "Preserve natural texture", scope: "general" })
    const duplicate = repo.createCorrection({ text: "Preserve natural texture", scope: "general" })
    expect(duplicate.duplicate).toBe(true)
    expect(duplicate.rule.id).toBe(first.rule.id)
    expect(repo.getHistory(first.rule.id)).toHaveLength(1)
  })

  it("rejects a mismatched idempotent generation retry", () => {
    database = openAutomationDatabase(":memory:")
    const research = new ResearchRepository(database)
    const creative = new CreativeRepository(database)
    const investigation = research.createInvestigation({ title: "A", mode: "open", query: "", suggestedProductType: null })
    const opportunity = creative.createOpportunity(investigation.id, "B")
    const concept = creative.createConcept({ investigationId: investigation.id, opportunityId: opportunity, title: "C" })
    const prompt = creative.savePromptVersion({ conceptId: concept, text: "Original", origin: "owner" })
    const project = creative.createProject(investigation.id, "Project")
    const design = creative.createDesign({ projectId: project, conceptId: concept, promptId: prompt.promptId, promptRevision: 1 })
    const first = creative.createGenerationConfig({ designId: design, productType: "vertical_wall_art", provider: "pending" })
    const second = creative.createGenerationConfig({ designId: design, productType: "frame_tv_art", provider: "pending" })
    const base = { designId: design, conceptId: concept, promptId: prompt.promptId, promptRevision: 1, idempotencyKey: "same" }
    const job = creative.createGenerationJob({ ...base, configId: first })
    expect(creative.createGenerationJob({ ...base, configId: first })).toBe(job)
    expect(() => creative.createGenerationJob({ ...base, configId: second })).toThrow(/Idempotency key/)
  })
})
