import { describe, expect, it } from "vitest"
import { normalizeBoardName } from "./publishing"

describe("Pinterest board names", () => {
  it("coinciden sin importar mayúsculas, espacios ni signos", () => {
    expect(normalizeBoardName("Frame TV Art")).toBe(normalizeBoardName("frame  tv art "))
    expect(normalizeBoardName("PNG Designs")).toBe("png designs")
    expect(normalizeBoardName("Nursery Wall-Art")).toBe("nursery wall art")
  })
})
