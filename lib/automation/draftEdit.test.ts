import { describe, expect, it } from "vitest"
import { parseListingEdit } from "./draftEdit"

const CODE = "LBCreaStudio-FT733P"

describe("listing edits by Claude", () => {
  it("exige motivo y al menos un cambio", () => {
    expect(() => parseListingEdit({ title: "New title" }, CODE)).toThrow(/reason is required/)
    expect(() => parseListingEdit({ reason: "better" }, CODE)).toThrow(/Nothing to change/)
  })

  it("respeta los límites de Etsy y el código del producto", () => {
    expect(() => parseListingEdit({ reason: "r", title: "x".repeat(141) }, CODE)).toThrow(/at most 140/)
    expect(() => parseListingEdit({ reason: "r", tags: Array.from({ length: 14 }, (_, i) => `tag ${i}`) }, CODE)).toThrow(/1 to 13/)
    expect(() => parseListingEdit({ reason: "r", tags: ["this tag is far too long"] }, CODE)).toThrow(/at most 20/)
    expect(() => parseListingEdit({ reason: "r", tags: ["Snow", "snow"] }, CODE)).toThrow(/must not repeat/)
    expect(() => parseListingEdit({ reason: "r", description: "No code here" }, CODE)).toThrow(/keep the product code FT733P/)
    expect(parseListingEdit({ reason: "r", description: "Nice art\nFT733P" }, CODE).description).toBe("Nice art\nFT733P")
    expect(() => parseListingEdit({ reason: "r", altTexts: [{ rank: 0, altText: "x" }] }, CODE)).toThrow(/photo position/)
  })

  it("acepta una corrección válida", () => {
    const edit = parseListingEdit({
      reason: "Fixed images had no alt text",
      altTexts: [{ rank: 5, altText: "Size guide showing the Frame TV art file" }],
      tags: ["christmas eve art"],
    }, CODE)
    expect(edit.altTexts).toEqual([{ rank: 5, altText: "Size guide showing the Frame TV art file" }])
    expect(edit.tags).toEqual(["christmas eve art"])
    const attributes = parseListingEdit({ reason: "r", attributes: [{ name: "Primary color", values: ["Green"] }] }, CODE)
    expect(attributes.attributes).toEqual([{ name: "Primary color", values: ["Green"] }])
    expect(parseListingEdit({ reason: "r", attributes: [{ name: "Occasion", values: [] }] }, CODE).attributes).toEqual([{ name: "Occasion", values: [] }])
  })
})
