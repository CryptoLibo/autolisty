import { describe, expect, it } from "vitest"
import { FIXED_IMAGE_ALT_TEXTS } from "./fixedImageAltTexts"
import { getProductionProductContract } from "../automation/productContracts"

describe("fixed image alt texts", () => {
  it("cubren las fotos fijas de cada producto y respetan el límite de Etsy", () => {
    for (const [productType, texts] of Object.entries(FIXED_IMAGE_ALT_TEXTS)) {
      const fixed = getProductionProductContract(productType as keyof typeof FIXED_IMAGE_ALT_TEXTS).listing.fixedImageSlots
      expect(Object.keys(texts).map(Number).sort((a, b) => a - b)).toEqual([...fixed].sort((a, b) => a - b))
      for (const text of Object.values(texts)) {
        expect(text.length).toBeGreaterThan(80)
        expect(text.length).toBeLessThanOrEqual(250)
      }
    }
  })
})
