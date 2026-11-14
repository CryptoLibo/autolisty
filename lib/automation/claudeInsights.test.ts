import { describe, expect, it } from "vitest"
import { openAutomationDatabase } from "./db/database"
import { AutomationRepository } from "./repository"
import { listFeedback, getSalesByListing } from "./claudeInsights"
import { submissionWarnings } from "./designIntake"

describe("contexto para Claude", () => {
  it("list_feedback junta rechazos, ediciones y avisos del SEO", () => {
    const db = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(db)
    const job = repository.createJob({ productType: "frame_tv_art", sourcePrompt: "p", origin: "claude" })
    repository.transitionJob(job.id, "SOURCE_READY")
    repository.transitionJob(job.id, "PENDING_APPROVAL")
    repository.reviewJob(job.id, "reject", "Colores apagados")
    repository.recordJobEvent(job.id, "CLAUDE_EDIT", "edit", { reason: "Room incompleto", changes: { "attribute:Room": {} } })
    repository.recordJobEvent(job.id, "SEO_CHECK", "Comprobación final: 1 aviso(s) — Faltan los colores.")
    repository.recordJobEvent(job.id, "SEO_CHECK", "Comprobación final: todo correcto.")
    const feedback = listFeedback({}, db)
    expect(feedback.rejections[0]).toMatchObject({ note: "Colores apagados" })
    expect(feedback.edits[0]).toMatchObject({ fields: ["attribute:Room"], reason: "Room incompleto" })
    expect(feedback.seoWarnings).toHaveLength(1)
  })

  it("ventas: sin pedidos sincronizados no inventa nada", () => {
    const db = openAutomationDatabase(":memory:")
    expect(getSalesByListing({}, db)).toMatchObject({ available: false, listings: [] })
  })

  it("avisos al enviar un diseño", () => {
    const warnings = submissionWarnings({ primaryKeyword: null, tagCandidates: [{ keyword: "an extremely long tag phrase" }] }).join(" ")
    expect(warnings).toMatch(/primaryKeyword/)
    expect(warnings).toMatch(/20 characters/)
    expect(warnings).toMatch(/Only 1/)
  })
})
