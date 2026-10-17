import { describe, expect, it } from "vitest"
import { PRODUCT_OPTIONS } from "../products"
import {
  PRODUCTION_PRODUCT_CONTRACTS,
  getProductionProductContract,
} from "./productContracts"

describe("production product contracts", () => {
  it("defines a contract for every product visible in Autolisty", () => {
    expect(Object.keys(PRODUCTION_PRODUCT_CONTRACTS).sort()).toEqual(
      PRODUCT_OPTIONS.map((product) => product.value).sort()
    )
  })

  it("keeps the established listing image slots", () => {
    const contract = getProductionProductContract("png_designs")
    expect(contract.listing.generatedImageSlots).toEqual([1, 3, 4, 6, 7, 9, 10])
    expect(contract.listing.fixedImageSlots).toEqual([5, 8, 11])
    expect(contract.listing.videoSlot).toBe(2)
    expect(contract.listing.pinterestImageCount).toBe(3)
  })

  it("keeps PNG Designs as a single direct-delivery PNG", () => {
    const contract = getProductionProductContract("png_designs")
    expect(contract.source.maxFiles).toBe(1)
    expect(contract.source.acceptedMimeTypes).toEqual(["image/png"])
    expect(contract.delivery).toEqual({ mode: "direct", requiredFieldIds: ["design"] })
  })
})
