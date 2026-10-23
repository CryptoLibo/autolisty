import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

const model = vi.hoisted(() => vi.fn())
vi.mock("openai", () => ({ default: class { responses = { create: model } } }))

import { openAutomationDatabase } from "../automation/db/database"
import { AutomationRepository } from "../automation/repository"
import { openCompanyDatabase } from "./db"
import { CompanyRepository } from "./repository"
import { runCompanyStage } from "./runner"
import { acceptTelegramUpdate, processTelegramUpdate } from "./telegram"

describe("James get_jobs in shared web and Telegram conversation", () => {
  const previousPath = process.env.AUTOMATION_DB_PATH
  const previousKey = process.env.OPENAI_API_KEY
  afterEach(() => {
    vi.restoreAllMocks()
    if (previousPath === undefined) delete process.env.AUTOMATION_DB_PATH
    else process.env.AUTOMATION_DB_PATH = previousPath
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousKey
  })

  it("answers both channels from the same Automation job without a commercial call", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "james-flow-test-"))
    const file = path.join(directory, "automation.sqlite")
    process.env.AUTOMATION_DB_PATH = file
    process.env.OPENAI_API_KEY = "test"
    const automationDb = openAutomationDatabase(file)
    const automation = new AutomationRepository(automationDb)
    const job = automation.createJob({ productType: "png_designs", sourcePrompt: "Existing art" })
    automationDb.close()
    const companyDb = openCompanyDatabase(":memory:")
    try {
      const repository = new CompanyRepository(companyDb)
      const conversationId = repository.createConversation()
      repository.linkTelegramConversation("123", conversationId)
      model.mockImplementation(async () => ({ status: "completed", output_text: JSON.stringify({ action: "get_jobs", answer: "", research_question: "", design_brief: "", specialist_agent_id: "", specialist_question: "" }), output: [], usage: { input_tokens: 20, output_tokens: 20, input_tokens_details: { cached_tokens: 0 } }, id: crypto.randomUUID() }))

      const webTask = repository.addUserMessage(conversationId, "James, ¿qué trabajos hay en Automation?")
      await runCompanyStage(repository, webTask, "owner_web")
      expect(repository.task(webTask)?.status).toBe("COMPLETED")
      expect(repository.messages(conversationId).at(-1)?.content).toContain(job.productCode)

      const update = acceptTelegramUpdate(repository, { update_id: 50, message: { chat: { id: 123, type: "private" }, text: "¿Cómo van los trabajos?" } }, "123")!
      const send = vi.fn<typeof fetch>(async () => new Response('{"ok":true}'))
      await processTelegramUpdate(repository, 50, "test-token", send)
      expect(repository.telegramUpdate(50)?.status).toBe("SENT")
      expect(JSON.parse(send.mock.calls[0][1]?.body as string).text).toContain(job.productCode)
      expect(repository.listConversations()).toHaveLength(1)
      expect(repository.messages(conversationId)).toHaveLength(4)
      expect(model).toHaveBeenCalledTimes(2)
      const unchanged = openAutomationDatabase(file)
      try { expect(new AutomationRepository(unchanged).listJobs()).toHaveLength(1) } finally { unchanged.close() }
      expect(update.task_id).toBeTruthy()
    } finally {
      companyDb.close()
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })

  it("denies a model-selected tool without a verified channel", async () => {
    process.env.OPENAI_API_KEY = "test"
    const db = openCompanyDatabase(":memory:")
    try {
      const repository = new CompanyRepository(db)
      const taskId = repository.addUserMessage(repository.createConversation(), "Consulta trabajos")
      model.mockResolvedValueOnce({ status: "completed", output_text: JSON.stringify({ action: "get_jobs", answer: "", research_question: "", design_brief: "", specialist_agent_id: "", specialist_question: "" }), output: [], usage: { input_tokens: 1, output_tokens: 1 }, id: "test" })
      await runCompanyStage(repository, taskId)
      expect(repository.task(taskId)).toMatchObject({ status: "NEEDS_REVIEW", last_error: "James tool access denied." })
    } finally { db.close() }
  })
})
