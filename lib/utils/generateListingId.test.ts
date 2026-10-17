import { describe, expect, it } from "vitest"
import {
  generateListingId,
  generateProductCode,
  isProductCode,
} from "./generateListingId"

describe("product code generation", () => {
  it("uses the established R2-compatible format", () => {
    expect(generateProductCode()).toMatch(/^LBCreaStudio-[A-Z0-9]{6}$/)
    expect(generateListingId()).toMatch(/^LBCreaStudio-[A-Z0-9]{6}$/)
  })

  it("validates only complete product codes", () => {
    expect(isProductCode("LBCreaStudio-ABC123")).toBe(true)
    expect(isProductCode("ABC123")).toBe(false)
    expect(isProductCode("LBCreaStudio-abc123")).toBe(false)
  })
})
