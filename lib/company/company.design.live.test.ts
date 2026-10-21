import path from "node:path"
import { describe, expect, it } from "vitest"
import { openCompanyDatabase } from "./db"
import { CompanyRepository } from "./repository"
import { runCompanyStage } from "./runner"

describe.skipIf(process.env.COMPANY_RUN_DESIGN_LIVE !== "1")("Company product and creative live circuit", () => {
  it("delegates one design proposal without search, production or a listing", async () => {
    expect(process.env.OPENAI_API_KEY, "OPENAI_API_KEY is required").toBeTruthy()
    expect(process.env.COMPANY_DISABLE_WEB_SEARCH).toBe("1")
    const db = openCompanyDatabase(path.join(process.cwd(), "data", "autolisty-company.sqlite"))
    try {
      const repository = new CompanyRepository(db)
      expect(repository.spend().remaining, "Insufficient pilot budget for four reserved calls").toBeGreaterThan(0.55)
      const conversationId = repository.createConversation()
      const taskId = repository.addUserMessage(conversationId,
        "Propón tres ideas distintas para una colección de vertical wall art digital dirigida a profesores de primaria, con temática de Halloween y lectura. Quiero conceptos comerciales originales y prompts breves para Kittl. Es solo una propuesta: no investigues en web, no generes imágenes, no produzcas archivos y no crees listings.")

      for (let step = 0; step < 4; step++) {
        const task = await runCompanyStage(repository, taskId)
        if (!task || ["COMPLETED", "NEEDS_REVIEW"].includes(task.status)) break
      }

      const task = repository.task(taskId)!
      expect(task.status, task.last_error || "Design task did not finish").toBe("COMPLETED")
      const unit = repository.designUnit(taskId)!
      expect(unit).toBeTruthy()
      expect(repository.project(unit.project_id)).toBeTruthy()
      expect(repository.projectUnits(unit.project_id)).toHaveLength(1)
      expect(repository.report(taskId)).toBeUndefined()
      expect(repository.calls(taskId).map((call) => (call as { agent_id: string }).agent_id))
        .toEqual(["ceo", "product_planner", "visual_designer", "ceo"])
      expect(repository.artifacts(taskId).map((artifact) => artifact.kind)).toEqual(["product_brief", "design_concepts"])
      expect((db.prepare("SELECT COUNT(*) AS count FROM company_listings WHERE project_id=?").get(unit.project_id) as { count: number }).count).toBe(0)

      console.log(JSON.stringify({
        conversationId, taskId, projectId: unit.project_id, unitId: unit.id,
        artifacts: repository.artifacts(taskId),
        answer: repository.messages(conversationId).at(-1)?.content,
        calls: repository.calls(taskId),
        pilotSpend: repository.spend(),
      }, null, 2))
    } finally { db.close() }
  }, 180_000)
})
