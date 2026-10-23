import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type Database from "better-sqlite3"
import { openCompanyDatabase } from "./db"
import { CompanyRepository } from "./repository"
import { estimateActualUsd, reserveEstimateUsd } from "./budget"

describe("Company circuit foundations", () => {
  let db: Database.Database | undefined
  let tempDirectory: string | undefined
  afterEach(() => {
    db?.close(); db = undefined
    if (tempDirectory && path.dirname(tempDirectory) === os.tmpdir() && path.basename(tempDirectory).startsWith("company-test-")) {
      fs.rmSync(tempDirectory, { recursive: true, force: true })
    }
    tempDirectory = undefined
  })

  function setup() {
    db = openCompanyDatabase(":memory:")
    return new CompanyRepository(db)
  }

  it("stores distinct durable agent identities with versioned instructions", () => {
    const repo = setup()
    expect((db!.prepare("SELECT COUNT(*) AS total FROM company_agents").get() as { total: number }).total).toBe(16)
    expect(repo.agentConfig("ceo")).toMatchObject({ id: "ceo", name: "James", active_instruction_version: 4, tools: [] })
    expect(repo.agentConfig("market_researcher")).toMatchObject({ id: "market_researcher", active_instruction_version: 2, tools: ["web_search", "alura_research"] })
    expect(repo.agentConfig("product_planner")).toMatchObject({ id: "product_planner", active_instruction_version: 3, tools: [] })
    expect(repo.agentConfig("visual_designer")).toMatchObject({ id: "visual_designer", active_instruction_version: 5, tools: [] })
    expect(repo.agentConfig("seo_specialist")).toMatchObject({ id: "seo_specialist", active_instruction_version: 1, tools: [] })
    expect(repo.agentConfig("creation_operator")).toMatchObject({ id: "creation_operator", active_instruction_version: 2, tools: ["kittl_generate", "kittl_download"] })
    expect(repo.renameAgent("ceo", "Alex")).toMatchObject({ id: "ceo", name: "Alex" })
    expect(repo.agentConfig("ceo").name).toBe("Alex")
  })

  it("upgrades the original Researcher permissions in an existing database", () => {
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "company-test-"))
    const file = path.join(tempDirectory, "company.sqlite")
    db = openCompanyDatabase(file)
    db.prepare("UPDATE company_agents SET tools_json=? WHERE id='market_researcher'").run('["web_search"]')
    db.close(); db = undefined

    db = openCompanyDatabase(file)
    expect(new CompanyRepository(db).agentConfig("market_researcher").tools).toEqual(["web_search", "alura_research"])
    db.prepare("UPDATE company_agents SET tools_json=? WHERE id='market_researcher'").run('[]')
    db.close(); db = undefined

    db = openCompanyDatabase(file)
    expect(new CompanyRepository(db).agentConfig("market_researcher").tools).toEqual([])
  })

  it("moves abandoned queued work to incidents instead of counting it as active", () => {
    const repo = setup()
    const taskId = repo.addUserMessage(repo.createConversation(), "Investiga el nicho")
    db!.prepare("UPDATE company_tasks SET updated_at=? WHERE id=?").run(new Date(Date.now() - 31 * 60_000).toISOString(), taskId)
    expect(repo.recoverInterrupted()).toBe(1)
    expect(repo.task(taskId)?.status).toBe("NEEDS_REVIEW")
    expect(repo.overview().counts).toMatchObject({ running: 0, incidents: 1 })
  })

  it("persists a conversation, task, events and completion without production actions", () => {
    const repo = setup()
    const conversationId = repo.createConversation()
    const taskId = repo.addUserMessage(conversationId, "Investiga nursery wall art, sin producir nada")
    expect(repo.claimStage(taskId, "CEO_DECIDE")).toBe(true)
    expect(repo.claimStage(taskId, "CEO_DECIDE")).toBe(false)
    repo.stage(taskId, "RESEARCH", "RESEARCH_READY", { researchQuestion: "Nursery wall art demand" })
    repo.saveReport(taskId, "Evidence with limitations", [{ title: "Example", url: "https://example.com" }])
    repo.complete(taskId, "Encontré datos con limitaciones.")
    expect(repo.task(taskId)?.status).toBe("COMPLETED")
    expect(repo.messages(conversationId)).toHaveLength(2)
    expect(repo.recentContext(conversationId).reports).toHaveLength(1)
    expect(repo.events(taskId).length).toBeGreaterThan(2)
  })

  it("persists specialist delegation, its result and individual attribution", () => {
    const repo = setup()
    const conversationId = repo.createConversation()
    const taskId = repo.addUserMessage(conversationId, "Consulta a finanzas sobre costes")
    expect(repo.claimStage(taskId, "CEO_DECIDE")).toBe(true)
    repo.stage(taskId, "SPECIALIST", "SPECIALIST_READY", {
      specialistAgentId: "finance_lead", specialistQuestion: "Compara los costes registrados.",
    })
    expect(repo.task(taskId)).toMatchObject({ specialist_agent_id: "finance_lead", status: "SPECIALIST_READY" })
    expect(repo.claimStage(taskId, "SPECIALIST")).toBe(true)
    expect(repo.claimStage(taskId, "SPECIALIST")).toBe(false)
    repo.saveSpecialistResult(taskId, "Los costes calculados no son facturación oficial.")
    expect(repo.artifact(taskId, "specialist_result")?.content).toContain("facturación oficial")
    expect(repo.task(taskId)).toMatchObject({ stage: "CEO_SYNTHESIZE", status: "SYNTHESIS_READY" })
    expect(repo.events(taskId).some((event) => event.event_type === "specialist_result_delivered")).toBe(true)
  })

  it("reserves cumulative budget atomically and separates model from search spend", () => {
    const repo = setup()
    const taskId = repo.addUserMessage(repo.createConversation(), "Hola")
    const reserve = reserveEstimateUsd("gpt-5.4-mini", true)
    const callId = repo.reserveCall(taskId, "market_researcher", "gpt-5.4-mini", reserve)
    expect(repo.spend().total).toBeCloseTo(reserve)
    expect(() => repo.reserveCall(taskId, "ceo", "gpt-5.4", 5)).toThrow(/budget exhausted/i)
    const cost = estimateActualUsd(1000, 100, 400, 2, "gpt-5.4-mini")
    repo.finishCall(callId, { ...cost, inputTokens: 1000, cachedTokens: 100, outputTokens: 400, webCalls: 2, responseId: "resp_test" })
    expect(repo.spend().model).toBeCloseTo(cost.modelUsd)
    expect(repo.spend().tools).toBeCloseTo(0.02)
    expect(repo.spend().total).toBeCloseTo(cost.totalUsd)
  })

  it("caps Alura credits before requests and retains uncertain charges", () => {
    const repo = setup()
    const taskId = repo.addUserMessage(repo.createConversation(), "Investiga Etsy")
    const first = repo.reserveExternalCredits(taskId, "alura", 10, 20)
    repo.finishExternalCredits(first, 10, 90)
    const second = repo.reserveExternalCredits(taskId, "alura", 10, 20)
    repo.markExternalCreditsUnknown(second)
    expect(repo.externalCredits("alura")).toEqual({ used: 20, requests: 2 })
    expect(() => repo.reserveExternalCredits(taskId, "alura", 10, 20)).toThrow(/credit cap exhausted/)
    expect(repo.events(taskId).filter((event) => event.event_type === "external_credits_charged")).toHaveLength(1)
  })

  it("allocates one persistent product code to a listing bundle, not to its design units", () => {
    const repo = setup()
    const conversationId = repo.createConversation()
    const firstTask = repo.addUserMessage(conversationId, "First design")
    const first = repo.ensureDesignUnit(firstTask, "Collection")
    repo.complete(firstTask, "Ready")
    const secondTask = repo.addUserMessage(conversationId, "Second design")
    const second = repo.ensureDesignUnit(secondTask, "Second", first.project_id)
    const listing = repo.createListing(first.project_id, [first.id, second.id])
    expect(listing.productCode).toMatch(/^LBCreaStudio-[A-Z0-9]{6}$/)
    expect(repo.projectListings(first.project_id)).toMatchObject([{ product_code: listing.productCode, unit_count: 2 }])
    expect(() => repo.createListing(first.project_id, [first.id, first.id])).toThrow(/distinct/)
    expect(() => repo.createListing(first.project_id, ["unknown"])).toThrow(/belong/)
  })

  it("retains ambiguous failures as reserved spend and does not silently retry", () => {
    const repo = setup()
    const taskId = repo.addUserMessage(repo.createConversation(), "Hola")
    const callId = repo.reserveCall(taskId, "ceo", "gpt-5.4", 0.25)
    repo.failCall(callId, "Network timeout")
    repo.failTask(taskId, "Review before retry")
    expect(repo.spend().total).toBeCloseTo(0.25)
    expect(repo.claimStage(taskId, "CEO_DECIDE")).toBe(false)
    expect(repo.task(taskId)?.status).toBe("NEEDS_REVIEW")
  })

  it("releases reservations only for a definitely unbilled authentication failure", () => {
    const repo = setup()
    const taskId = repo.addUserMessage(repo.createConversation(), "Hola")
    const callId = repo.reserveCall(taskId, "ceo", "gpt-5.4", 0.25)
    repo.failCall(callId, "OpenAI authentication failed (401).", true)
    expect(repo.spend().total).toBe(0)
    expect(repo.calls(taskId)).toMatchObject([{ status: "FAILED_NO_CHARGE" }])
  })

  it("survives closing and reopening SQLite with agents, reports, tokens and budget intact", () => {
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "company-test-"))
    const databasePath = path.join(tempDirectory, "company.sqlite")
    db = openCompanyDatabase(databasePath)
    let repo = new CompanyRepository(db)
    const conversationId = repo.createConversation()
    const taskId = repo.addUserMessage(conversationId, "Investiga un nicho")
    const callId = repo.reserveCall(taskId, "market_researcher", "gpt-5.4-mini", 0.12)
    const cost = estimateActualUsd(1000, 0, 100, 1, "gpt-5.4-mini")
    repo.finishCall(callId, { ...cost, inputTokens: 1000, cachedTokens: 0, outputTokens: 100, webCalls: 1, responseId: "resp_persisted" })
    repo.saveReport(taskId, "Datos comprobados", [{ title: "Fuente", url: "https://example.com" }])
    repo.complete(taskId, "Conclusión")
    db.close()
    db = openCompanyDatabase(databasePath)
    repo = new CompanyRepository(db)
    expect(repo.agentConfig("market_researcher").active_instruction_version).toBe(2)
    expect(repo.renameAgent("ceo", "James II").id).toBe("ceo")
    db.close()
    db = openCompanyDatabase(databasePath)
    repo = new CompanyRepository(db)
    expect(repo.agentConfig("ceo").name).toBe("James II")
    expect(repo.messages(conversationId)).toHaveLength(2)
    expect(repo.report(taskId)?.content).toBe("Datos comprobados")
    expect(repo.spend().total).toBeCloseTo(cost.totalUsd)
    expect(repo.localDailyTokens().economy.used).toBe(1100)
  })

  it("reuses an identical recent research question without another research call", () => {
    const repo = setup()
    const first = repo.addUserMessage(repo.createConversation(), "Investiga el nicho")
    repo.stage(first, "RESEARCH", "RESEARCH_READY", { researchQuestion: "Nursery wall art digital en Etsy" })
    repo.saveReport(first, "Informe existente", [{ title: "Etsy", url: "https://www.etsy.com" }])
    repo.complete(first, "Conclusión")
    const second = repo.addUserMessage(repo.createConversation(), "Investiga el mismo nicho")
    repo.stage(second, "RESEARCH", "RESEARCH_READY", { researchQuestion: "  nursery WALL art digital en Etsy  " })
    expect(repo.reuseRecentReport(second, "  nursery WALL art digital en Etsy  ")).toBe(true)
    expect(repo.report(second)?.content).toBe("Informe existente")
    expect(repo.calls(second)).toHaveLength(0)
    expect(repo.events(second).map((event) => event.event_type)).toContain("research_reused")
  })

  it("persists research, product planning and visual design through the CEO handoff", () => {
    const repo = setup()
    const conversationId = repo.createConversation()
    const taskId = repo.addUserMessage(conversationId, "Propón tres diseños de wall art")
    expect(repo.claimStage(taskId, "CEO_DECIDE")).toBe(true)
    repo.stage(taskId, "RESEARCH", "RESEARCH_READY", {
      researchQuestion: "Demanda de wall art digital", designBrief: "Tres conceptos de wall art para nursery",
    })
    const unit = repo.designUnit(taskId)!
    expect(repo.project(unit.project_id)).toMatchObject({ id: unit.project_id, status: "PROPOSAL" })
    expect(repo.projectUnits(unit.project_id)).toHaveLength(1)
    expect(repo.claimStage(taskId, "RESEARCH")).toBe(true)
    repo.saveReport(taskId, "Datos con fuentes", [{ title: "Ejemplo", url: "https://example.com" }])
    expect(repo.projectArtifacts(unit.project_id, "market_research")).toHaveLength(1)
    expect(repo.task(taskId)).toMatchObject({ stage: "PRODUCT_PLAN", status: "DESIGN_READY" })
    expect(repo.claimStage(taskId, "PRODUCT_PLAN")).toBe(true)
    repo.saveArtifact(taskId, "product_brief", "Lámina digital para nursery, público: familias")
    expect(repo.task(taskId)).toMatchObject({ stage: "VISUAL_DESIGN", status: "DESIGN_READY" })
    expect(repo.claimStage(taskId, "VISUAL_DESIGN")).toBe(true)
    repo.saveArtifact(taskId, "design_concepts", "Concepto A: ilustración botánica")
    expect(repo.task(taskId)).toMatchObject({ stage: "CEO_SYNTHESIZE", status: "SYNTHESIS_READY" })
    expect(repo.claimStage(taskId, "CEO_SYNTHESIZE")).toBe(true)
    repo.complete(taskId, "Aquí tienes tres propuestas.")
    expect(repo.artifacts(taskId).map((artifact) => artifact.kind)).toEqual(["product_brief", "design_concepts"])
    expect(repo.recentContext(conversationId).artifacts).toHaveLength(2)
    expect(repo.events(taskId).filter((event) => event.event_type === "artifact_delivered")).toHaveLength(2)
  })

  it("keeps collection, design units and commercial listings as different identities", () => {
    const repo = setup()
    const conversationId = repo.createConversation()
    const first = repo.addUserMessage(conversationId, "Primer diseno")
    repo.stage(first, "PRODUCT_PLAN", "DESIGN_READY", { designBrief: "Primera pieza" })
    const firstUnit = repo.designUnit(first)!
    repo.complete(first, "Propuesta terminada")
    const second = repo.addUserMessage(conversationId, "Segunda pieza de la coleccion")
    const secondUnit = repo.ensureDesignUnit(second, "Segunda pieza", firstUnit.project_id)
    repo.stage(second, "PRODUCT_PLAN", "DESIGN_READY", { designBrief: "Segunda pieza" })
    expect(secondUnit.id).not.toBe(firstUnit.id)
    expect(repo.designUnit(second)?.project_id).toBe(firstUnit.project_id)
    expect(repo.projectUnits(firstUnit.project_id)).toHaveLength(2)
    expect(repo.projectArtifacts(firstUnit.project_id, "market_research")).toHaveLength(0)
    expect((db!.prepare("SELECT COUNT(*) AS count FROM company_listings").get() as { count: number }).count).toBe(0)
  })

  it("plans a requested design without requiring web research", () => {
    const repo = setup()
    const taskId = repo.addUserMessage(repo.createConversation(), "Diseña a partir de esta idea")
    repo.stage(taskId, "PRODUCT_PLAN", "DESIGN_READY", { designBrief: "Idea existente" })
    expect(repo.task(taskId)?.design_brief).toBe("Idea existente")
    expect(repo.report(taskId)).toBeUndefined()
    expect(repo.claimStage(taskId, "PRODUCT_PLAN")).toBe(true)
    repo.saveArtifact(taskId, "product_brief", "Brief sin validación de mercado")
    expect(repo.task(taskId)?.stage).toBe("VISUAL_DESIGN")
  })

  it("recovers a design project, unit and artifacts after reopening SQLite", () => {
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "company-test-"))
    const databasePath = path.join(tempDirectory, "company.sqlite")
    db = openCompanyDatabase(databasePath)
    let repo = new CompanyRepository(db)
    const taskId = repo.addUserMessage(repo.createConversation(), "Proponer arte")
    repo.stage(taskId, "PRODUCT_PLAN", "DESIGN_READY", { designBrief: "Una pieza de wall art" })
    const unit = repo.designUnit(taskId)!
    expect(repo.claimStage(taskId, "PRODUCT_PLAN")).toBe(true)
    repo.saveArtifact(taskId, "product_brief", "Brief verificable")
    expect(repo.claimStage(taskId, "VISUAL_DESIGN")).toBe(true)
    repo.saveArtifact(taskId, "design_concepts", "Dos direcciones")
    db.close()

    db = openCompanyDatabase(databasePath)
    repo = new CompanyRepository(db)
    expect(repo.designUnit(taskId)).toMatchObject({ id: unit.id, project_id: unit.project_id })
    expect(repo.project(unit.project_id)?.title).toBe("Una pieza de wall art")
    expect(repo.artifacts(taskId).map((artifact) => artifact.content)).toEqual(["Brief verificable", "Dos direcciones"])
    expect(repo.task(taskId)).toMatchObject({ stage: "CEO_SYNTHESIZE", status: "SYNTHESIS_READY" })
  })

  it("persists owner review and reuses only relevant approved prompts", () => {
    const repo = setup()
    const taskId = repo.addUserMessage(repo.createConversation(), "Design Halloween classroom wall art")
    repo.stage(taskId, "PRODUCT_PLAN", "DESIGN_READY", { designBrief: "Halloween classroom wall art" })
    expect(repo.claimStage(taskId, "PRODUCT_PLAN")).toBe(true)
    repo.saveArtifact(taskId, "product_brief", "Halloween classroom wall art for teachers")
    expect(repo.claimStage(taskId, "VISUAL_DESIGN")).toBe(true)
    const concept = { name: "Reading Ghosts", visual_idea: "Friendly ghosts read", prompt: "Create Halloween classroom wall art with reading ghosts and orange books.", rationale: "School fit", text_mode: "none" as const, exact_text: "", typography: "", hierarchy: "" }
    repo.saveArtifact(taskId, "design_concepts", "Reading Ghosts", { concepts: [concept] })
    expect(repo.claimStage(taskId, "CEO_SYNTHESIZE")).toBe(true)
    repo.complete(taskId, "Proposal ready")
    expect(() => repo.saveDesignReview(taskId, 0, "approved", "Looks good", null)).toThrow(/Kittl result link/i)
    expect(repo.saveDesignReview(taskId, 0, "approved", "Clear focal point", "https://www.kittl.com/project/123")).toMatchObject([{ verdict: "approved", notes: "Clear focal point" }])
    expect(repo.relevantDesignExamples("Halloween classroom wall art for teachers")).toMatchObject([{ prompt: concept.prompt, ownerNotes: "Clear focal point" }])
    expect(repo.relevantDesignExamples("Wedding invitations for couples")).toEqual([])
    expect(() => repo.saveDesignReview(taskId, 1, "approved", "", "https://www.kittl.com/project/123")).toThrow(/not found/i)
    repo.saveDesignReview(taskId, 0, "revise", "Text unreadable", null)
    expect(repo.relevantDesignExamples("Halloween classroom wall art for teachers")).toEqual([])
  })

  it("routes only an explicit image request from design to the Kittl operator", () => {
    const repo = setup()
    const taskId = repo.addUserMessage(repo.createConversation(), "Investiga y crea una imagen")
    repo.stage(taskId, "PRODUCT_PLAN", "DESIGN_READY", { designBrief: "Wall art digital", imageRequested: true })
    expect(repo.task(taskId)?.image_requested).toBe(1)
    expect(repo.claimStage(taskId, "PRODUCT_PLAN")).toBe(true)
    repo.saveArtifact(taskId, "product_brief", "Brief digital")
    expect(repo.claimStage(taskId, "VISUAL_DESIGN")).toBe(true)
    const concept = { name: "Floral", visual_idea: "Flores", prompt: "Create a floral printable wall art design.", rationale: "Readable", text_mode: "none" as const, exact_text: "", typography: "", hierarchy: "" }
    repo.saveArtifact(taskId, "design_concepts", "Concepto floral", { concepts: [concept] })
    expect(repo.task(taskId)).toMatchObject({ stage: "KITTL_SELECT", status: "DESIGN_READY" })
    expect(repo.claimStage(taskId, "KITTL_SELECT")).toBe(true)
    repo.recordKittlSelection(taskId, { concept_index: 0, model_id: "real-model", aspect_ratio: "3:4", reason: "Adecuado al arte" })
    expect(repo.artifact(taskId, "kittl_selection")?.data_json).toContain("real-model")
    expect(() => repo.recordKittlSelection(taskId, { concept_index: 0, model_id: "again", aspect_ratio: "3:4", reason: "" })).toThrow()
  })

  it("reports real projects, units and incidents in the operations overview", () => {
    const repo = setup()
    const taskId = repo.addUserMessage(repo.createConversation(), "Propón una pieza")
    repo.stage(taskId, "PRODUCT_PLAN", "DESIGN_READY", { designBrief: "One wall art design" })
    repo.failTask(taskId, "Needs a product decision")
    expect(repo.overview().counts).toMatchObject({ projects: 1, units: 1, listings: 0, incidents: 1, running: 0 })
    expect(repo.overview().projects[0]).toMatchObject({ title: "One wall art design", units: 1 })
  })

  it("cancels only a queued task and removes its stale Telegram delivery", () => {
    const repo = setup()
    const update = repo.receiveTelegramUpdate(88, "123", "Encargo antiguo")
    expect(repo.overview().counts.running).toBe(1)
    expect(repo.cancelQueuedTask(update.task_id!)).toBe(true)
    expect(repo.task(update.task_id!)?.status).toBe("CANCELLED")
    expect(repo.telegramUpdate(88)?.status).toBe("ABANDONED")
    expect(repo.overview().counts).toMatchObject({ running: 0, incidents: 0 })
    expect(repo.cancelQueuedTask(update.task_id!)).toBe(false)
    const running = repo.addUserMessage(repo.telegramConversation("123"), "Encargo nuevo")
    expect(repo.claimStage(running, "CEO_DECIDE")).toBe(true)
    expect(repo.cancelQueuedTask(running)).toBe(false)
  })
})
