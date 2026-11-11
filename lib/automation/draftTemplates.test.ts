import { describe, expect, it } from "vitest"
import { openAutomationDatabase } from "./db/database"
import { AutomationRepository } from "./repository"

describe("draft templates", () => {
  it("una plantilla nunca entra en el pool, no se importa ni se asigna", () => {
    const repository = new AutomationRepository(openAutomationDatabase(":memory:"))
    repository.addDrafts("frame_tv_art", ["100", "101"])
    repository.setDraftTemplate("frame_tv_art", "100")

    expect(repository.getDraftTemplates()).toEqual({ frame_tv_art: "100" })
    // Estaba disponible en el pool: sale de él.
    expect(repository.countAvailableDrafts("frame_tv_art")).toBe(1)
    // Añadirla a mano se ignora.
    expect(repository.addDrafts("frame_tv_art", ["100", "102"])).toMatchObject({ added: 1, templatesSkipped: 1 })
    // Cuenta como conocida: no aparece al importar desde Etsy.
    expect(repository.knownEtsyListingIds().has("100")).toBe(true)

    const job = repository.createJob({ productType: "frame_tv_art", sourcePrompt: "Snowy village" })
    expect(repository.assignDraftToJob(job.id)).toBe("101")
  })

  it("no acepta como plantilla un draft que ya usa un listing", () => {
    const repository = new AutomationRepository(openAutomationDatabase(":memory:"))
    repository.addDrafts("frame_tv_art", ["200"])
    const job = repository.createJob({ productType: "frame_tv_art", sourcePrompt: "Snowy village" })
    repository.assignDraftToJob(job.id)
    expect(() => repository.setDraftTemplate("frame_tv_art", "200")).toThrow(/already used/)
  })
})
