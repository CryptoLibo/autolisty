import { describe, expect, it } from "vitest"
import { checkSeoResult, type SeoForCheck } from "./seoCheck"

const good: SeoForCheck = {
  title: "Autumn Vineyard Frame TV Art Golden Hour Landscape Samsung Painting Fall Decor | (Digital Download)",
  description_keywords_5: ["frame tv art", "autumn vineyard"],
  description_final: "Bring frame tv art warmth home with this autumn vineyard scene. Code ABC123.",
  tags_13: ["frame tv art", "autumn decor", "vineyard art", "fall tv art", "samsung frame", "golden hour", "landscape art",
    "fall painting", "tv screensaver", "wine country", "harvest decor", "rustic tv art", "farmhouse tv"],
  etsy_attributes: [
    { displayName: "Primary color", values: ["Orange"] },
    { displayName: "Room", values: ["Living room", "Bedroom", "Dining room", "Office"] },
    { displayName: "Subject", values: ["Landscape & scenery", "Plants & trees"] },
  ],
  media: [
    { id: "a", position: 1, alt_text: "Autumn vineyard frame tv art showing rows of golden vines at sunset on a Samsung Frame TV in a cozy living room." },
    { id: "b", position: 2, alt_text: "Close view of the autumn vineyard frame tv art, warm golden light over rolling hills and grapevines in fall colors." },
  ],
}

describe("comprobación final del SEO", () => {
  it("un listing correcto no tiene avisos", () => {
    expect(checkSeoResult(good, { productCode: "LBCreaStudio-ABC123" })).toEqual([])
  })

  it("detecta sufijo, tags, keywords, alt text y atributos", () => {
    const issues = checkSeoResult({
      ...good,
      title: "Vineyard Vineyard Art",
      tags_13: ["a tag that is far too long for etsy", "x"],
      description_final: "Nothing here",
      media: [{ id: "a", position: 1, alt_text: "short" }],
      etsy_attributes: [{ displayName: "Room", values: ["Bedroom"] }],
    }, { productCode: "LBCreaStudio-ABC123" })
    expect(issues.join("\n")).toMatch(/no termina/)
    expect(issues.join("\n")).toMatch(/repetidas/)
    expect(issues.join("\n")).toMatch(/2 tags/)
    expect(issues.join("\n")).toMatch(/20 caracteres/)
    expect(issues.join("\n")).toMatch(/descripción/)
    expect(issues.join("\n")).toMatch(/fotos 1/)
    expect(issues.join("\n")).toMatch(/colores/)
    expect(issues.join("\n")).toMatch(/Room tiene 1/)
  })
})
