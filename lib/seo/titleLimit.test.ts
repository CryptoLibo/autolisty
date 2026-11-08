import { describe, expect, it } from "vitest"
import { keepSuffixWithinLimit } from "./titleLimit"

describe("keepSuffixWithinLimit", () => {
  it("quita palabras antes del sufijo en vez de cortarlo", () => {
    const title = "Woodland Christmas Nursery Print, Pastel Watercolor Wall Art, Winter Nursery Decor (Digital Download)"
    const trimmed = keepSuffixWithinLimit(title, "(Digital Download)", 100)
    expect(trimmed.endsWith("(Digital Download)")).toBe(true)
    expect(trimmed.length).toBeLessThanOrEqual(100)
    expect(trimmed).toBe("Woodland Christmas Nursery Print, Pastel Watercolor Wall Art, Winter Nursery (Digital Download)")
  })

  it("deja igual un título dentro del límite", () => {
    expect(keepSuffixWithinLimit("Fox Print (Digital Download)", "(Digital Download)", 100)).toBe("Fox Print (Digital Download)")
  })
})
