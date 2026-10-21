import { describe, expect, it } from "vitest"
import { designConceptsText, reviewDesignConcepts, type DesignConcept } from "./design-quality"

const concept: DesignConcept = {
  name: "Biblioteca nocturna", visual_idea: "Una luna sobre libros y hojas de otoño.",
  prompt: "Create a vertical classroom poster with a crescent moon above open books and autumn leaves, centered editorial illustration in orange, midnight blue and cream. Set the exact headline \"READING IS MAGIC\" in bold high-contrast serif, large arched headline at top, with the books below and restrained decorative stars.",
  rationale: "Une lectura y Halloween sin saturación visual.", text_mode: "included",
  exact_text: "READING IS MAGIC", typography: "bold high-contrast serif",
  hierarchy: "large arched headline at top",
}

describe("design quality contract", () => {
  it("keeps exact copy and typography inside the complete English prompt", () => {
    expect(reviewDesignConcepts([concept])).toEqual([])
    expect(designConceptsText(JSON.stringify({ concepts: [concept] }))).toContain('"READING IS MAGIC" in bold high-contrast serif')
  })

  it("rejects vague text specifications and long prompts", () => {
    const invalid = { ...concept, exact_text: "", typography: "", prompt: `${concept.prompt} ${"adjetivo ".repeat(60)}` }
    expect(reviewDesignConcepts([invalid])).toEqual(expect.arrayContaining([
      expect.stringContaining("palabras exactas"), expect.stringContaining("25 y 90 palabras"),
    ]))
  })

  it("allows text-free concepts only with empty typography fields", () => {
    expect(reviewDesignConcepts([{ ...concept, text_mode: "none", exact_text: "", typography: "", hierarchy: "" }])).toEqual([])
    expect(reviewDesignConcepts([{ ...concept, text_mode: "none" }])).toContain("Concepto 1: modo de texto inconsistente.")
  })

  it("rejects prompts that defer or omit the actual text", () => {
    const deferred = { ...concept, prompt: "Create a vertical classroom poster with a crescent moon above open books and autumn leaves, centered editorial illustration in orange, midnight blue and cream. Leave space for text at the top, with the books below and restrained decorative stars." }
    expect(reviewDesignConcepts([deferred])).toEqual(expect.arrayContaining([
      expect.stringContaining("deja el texto para después"),
      expect.stringContaining("no incluye el texto exacto"),
      expect.stringContaining("no especifica tipografía"),
    ]))
  })

  it("rejects an unspecified secondary line of text", () => {
    const withSubtitle = { ...concept, prompt: `${concept.prompt} Add a smaller subtitle beneath it in a clean sans-serif.` }
    expect(reviewDesignConcepts([withSubtitle])).toContain("Concepto 1: el prompt pide texto secundario sin palabras exactas.")
  })
})
