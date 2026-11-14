import { describe, expect, it } from "vitest"
import { openAutomationDatabase } from "./db/database"
import { AutomationRepository } from "./repository"
import { parseDesignReport, parseReviewReport, ReviewReportStore } from "./reviewReports"

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

    const design = store.saveDesignReport(parseDesignReport({
      summary: "Enviados 3 diseños de Old World Santa.",
      designs: [{ productCode: "LBCreaStudio-ABC123", productType: "frame_tv_art", collection: "Old World Santa", notes: "nieve suave" }],
      discarded: ["1 con texto accidental"],
      observations: ["Los fondos de bosque se repiten"],
      credits: { kittl: "120", alura: "80" },
    }))
    expect(store.listDesignReports()[0].id).toBe(design.id)
    expect(store.list()).toHaveLength(1)
  })
})
