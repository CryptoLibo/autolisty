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

  it("stores two distinct durable agent identities with versioned instructions", () => {
    const repo = setup()
    expect(repo.agentConfig("ceo")).toMatchObject({ id: "ceo", name: "James", active_instruction_version: 1, tools: [] })
    expect(repo.agentConfig("market_researcher")).toMatchObject({ id: "market_researcher", active_instruction_version: 1, tools: ["web_search"] })
    expect(repo.renameAgent("ceo", "Alex")).toMatchObject({ id: "ceo", name: "Alex" })
    expect(repo.agentConfig("ceo").name).toBe("Alex")
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
    expect(repo.agentConfig("market_researcher").active_instruction_version).toBe(1)
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
})
