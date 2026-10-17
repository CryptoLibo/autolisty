import path from "node:path"
import { describe, expect, it } from "vitest"
import { openCompanyDatabase } from "./db"
import { CompanyRepository } from "./repository"
import { runCompanyStage } from "./runner"

describe.skipIf(process.env.COMPANY_RUN_LIVE !== "1")("Company live circuit", () => {
  it("runs two real agents and persists a sourced answer under the pilot cap", async () => {
    const db = openCompanyDatabase(path.join(process.cwd(), "data", "autolisty-company.sqlite"))
    try {
      const repository = new CompanyRepository(db)
      expect(repository.spend().remaining).toBeGreaterThan(0.5)
      const conversationId = repository.createConversation()
      const taskId = repository.addUserMessage(conversationId, "Investiga brevemente si hay demanda visible para nursery wall art digital en Etsy. Usa fuentes actuales y no crees productos ni listings.")
      for (let step = 0; step < 3; step++) {
        const task = await runCompanyStage(repository, taskId)
        if (!task || ["COMPLETED", "NEEDS_REVIEW"].includes(task.status)) break
      }
      const task = repository.task(taskId)
      expect(task?.status, task?.last_error || "Task did not finish").toBe("COMPLETED")
      expect(task?.report_id).toBeTruthy()
      expect(repository.calls(taskId).map((call) => (call as { agent_id: string }).agent_id)).toEqual(["ceo", "market_researcher", "ceo"])

      const followUpId = repository.addUserMessage(conversationId, "Basado solo en el informe que acabas de preparar, resume en dos frases la oportunidad y el principal riesgo. No hagas una nueva búsqueda.")
      const followUp = await runCompanyStage(repository, followUpId)
      expect(followUp?.status, followUp?.last_error || "Follow-up did not finish").toBe("COMPLETED")
      expect(repository.calls(followUpId).map((call) => (call as { agent_id: string }).agent_id)).toEqual(["ceo"])
      expect(repository.messages(conversationId).filter((message) => message.role === "assistant")).toHaveLength(2)
      expect(repository.spend().total).toBeLessThanOrEqual(5)
    } finally { db.close() }
  }, 180_000)
})
