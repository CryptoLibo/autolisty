import { afterEach, describe, expect, it, vi } from "vitest"
import type Database from "better-sqlite3"
import { openAutomationDatabase } from "../automation/db/database"
import { ResearchRepository } from "./repository"
import { LearningRepository } from "./learning"
import { generateCreativePrompts, type CreativeProvider } from "./creativeEngine"
import { evaluatePrompts, type PromptCandidate } from "./promptDiversity"
import { PromptRunRepository } from "./promptRuns"
import { MarketResearchRepository } from "./market/repository"

const samples: PromptCandidate[] = [
  { title: "Botanical", prompt: "An original botanical illustration with fern silhouettes and warm ink typography", subject: "ferns", composition: "vertical clustered stems", commercialAngle: "quiet nature" },
  { title: "Coastal", prompt: "A sculptural coastline of waves with pale mineral texture and hand-set lettering", subject: "ocean waves", composition: "wide layered horizon", commercialAngle: "coastal retreat" },
  { title: "Celestial", prompt: "A dramatic celestial map of constellations with copper stars and serif text", subject: "constellations", composition: "radial star chart", commercialAngle: "astronomy gift" },
  { title: "Architecture", prompt: "A geometric city facade with deep shadows, stone arches and modernist type", subject: "stone arches", composition: "asymmetric architectural grid", commercialAngle: "urban design" },
]

describe("creative prompt engine", () => {
  let db: Database.Database
  afterEach(() => db?.close())
  function setup(prompts = samples) {
    db = openAutomationDatabase(":memory:")
    const generate = vi.fn<CreativeProvider["generate"]>(async () => ({ prompts }))
    const repair = vi.fn<CreativeProvider["repair"]>(async (_context, _prompts, issues) => ({
      replacements: [...new Set(issues.map((issue) => issue.index))].map((index) => ({ index, prompt: samples[index] })) }))
    const provider: CreativeProvider = { model: "mock-model", generate, repair }
    return { provider, generate, repair, rules: new LearningRepository(db), runs: new PromptRunRepository(db) }
  }

  it("applies a saved correction to the next applicable generation", async () => {
    const { provider, generate, rules, runs } = setup()
    const correction = rules.createCorrection({ text: "Use crisp linework", scope: "general" })
    const result = await generateCreativePrompts(db, { brief: "nature", mode: "variations" }, provider)
    expect(generate.mock.calls[0][0].rules.map((rule) => rule.id)).toContain(correction.rule.id)
    const uses = db.prepare("SELECT correction_version FROM creative_rule_uses WHERE run_id=?").all(result.versionId)
    expect(uses).toEqual([{ correction_version: 1 }])
    expect(runs.get(result.versionId)?.prompts).toHaveLength(4)
  })

  it("isolates niche and product rules", async () => {
    const { provider, generate, rules } = setup()
    rules.createCorrection({ text: "Tall framing", scope: "product", scopeKey: "vertical_wall_art" })
    rules.createCorrection({ text: "Use fern shapes", scope: "niche", scopeKey: "botanical" })
    await generateCreativePrompts(db, { brief: "test", mode: "variations", niche: "botanical", productType: "vertical_wall_art" }, provider)
    await generateCreativePrompts(db, { brief: "test", mode: "variations", niche: "coastal", productType: "frame_tv_art" }, provider)
    expect(generate.mock.calls[0][0].rules).toHaveLength(2)
    expect(generate.mock.calls[1][0].rules).toHaveLength(0)
  })

  it.each(["variations", "independent"] as const)("persists four prompts in %s mode", async (mode) => {
    const { provider, runs } = setup()
    const result = await generateCreativePrompts(db, { brief: "art", mode }, provider)
    expect(result.prompts).toHaveLength(4)
    expect(result.evaluation.passed).toBe(true)
    const conceptIds = (runs.get(result.versionId)?.links as Array<{ concept_id: string }>).map((link) => link.concept_id)
    expect(new Set(conceptIds).size).toBe(mode === "variations" ? 1 : 4)
  })

  it("detects duplication and repairs only affected indexes once", async () => {
    const duplicated = [...samples]
    duplicated[2] = { ...samples[0] }
    const { provider, repair } = setup(duplicated)
    const result = await generateCreativePrompts(db, { brief: "art", mode: "independent" }, provider)
    expect(repair).toHaveBeenCalledTimes(1)
    expect(result.attempts).toHaveLength(2)
    expect(result.prompts[0]).toEqual(samples[0])
    expect(result.prompts[2]).toEqual(samples[2])
  })

  it("reuses results without another paid call and versions an explicit regeneration", async () => {
    const { provider, generate, runs } = setup()
    const input = { brief: "art", mode: "variations" as const }
    const first = await generateCreativePrompts(db, input, provider)
    const cached = await generateCreativePrompts(db, input, provider)
    expect(cached.cached).toBe(true)
    expect(generate).toHaveBeenCalledTimes(1)
    const next = await generateCreativePrompts(db, { ...input, regenerate: true }, provider)
    expect(next.runId).toBe(first.runId)
    expect(next.version).toBe(2)
    expect(runs.versions(first.runId)).toHaveLength(2)
  })

  it("keeps research independent of product settings and links provenance", async () => {
    const { provider, runs, generate } = setup()
    const investigation = new ResearchRepository(db).createInvestigation({ title: "Autumn", mode: "open", query: "leaf art", suggestedProductType: null })
    const result = await generateCreativePrompts(db, { brief: "leaves", mode: "variations", investigationId: investigation.id }, provider)
    expect(runs.get(result.versionId)?.investigationId).toBe(investigation.id)
    expect(generate.mock.calls[0][0].productType).toBeUndefined()
  })

  it("transfers current sourced opportunity evidence into prompt context", async () => {
    const { provider, generate } = setup()
    const investigation = new ResearchRepository(db).createInvestigation({ title: "Botanical", mode: "directed", query: "fern print", suggestedProductType: null })
    const market = new MarketResearchRepository(db)
    const ids = market.recordEvidence(investigation.id, [{ provider: "alura", sourceId: "keyword-1",
      sourceUrl: "https://api.alura.io/v1/research/keywords/1", capturedAt: new Date().toISOString(),
      period: "2026-09", metric: "competing_listings", unit: "listings", value: 120, nature: "observed", subject: "fern print" }])
    const opportunityId = market.addOpportunity(investigation.id, "Fern print", "Explore this keyword", ids)
    await generateCreativePrompts(db, { brief: "fern art", mode: "variations", investigationId: investigation.id, opportunityId }, provider)
    expect(generate.mock.calls[0][0].opportunityEvidence?.[0].value).toBe(120)
  })

  it("preserves legacy Prompt Lab route and rejects superficial independent concepts", () => {
    const repeated = samples.map((sample) => ({ ...sample, subject: "fern", composition: "central fern" }))
    expect(evaluatePrompts(repeated, "independent").passed).toBe(false)
    expect(evaluatePrompts(samples, "variations").passed).toBe(true)
  })
})
