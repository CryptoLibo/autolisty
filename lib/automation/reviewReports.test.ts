import { describe, expect, it } from "vitest"
import { openAutomationDatabase } from "./db/database"
import { AutomationRepository } from "./repository"
import { parseReviewReport, ReviewReportStore } from "./reviewReports"

describe("informes de la revisión diaria", () => {
  it("guarda el informe y marca cada listing como revisado", () => {
    const db = openAutomationDatabase(":memory:")
    const job = new AutomationRepository(db).createJob({ productType: "frame_tv_art", sourcePrompt: "x" })
    const store = new ReviewReportStore(db)
    const report = store.save(parseReviewReport({
      summary: "Revisados 1 draft: título cortado corregido.",
      listings: [{ productCode: job.productCode, changes: ["title"], issues: ["Título cortado"] }],
      patterns: ["Home style mal en cabañas"],
    }))
    expect(report.listings[0].changes).toEqual(["title"])
    expect(store.list()).toHaveLength(1)
    expect(store.lastReviewedAt([job.productCode]).get(job.productCode)).toBeTruthy()
    expect(() => parseReviewReport({ summary: "x" })).toThrow(/summary/)
  })
})
