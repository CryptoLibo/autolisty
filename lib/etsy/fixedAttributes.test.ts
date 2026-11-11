import { describe, expect, it } from "vitest"
import { matchFixedValues } from "./fixedAttributes"

const OPTIONS = [
  { valueId: 5179, name: "2:3" }, { valueId: 5171, name: "3:4" }, { valueId: 5174, name: "4:5" },
  { valueId: 5172, name: "11:14" }, { valueId: 5183, name: "5:7 (ISO ratio)" }, { valueId: 5180, name: "16:9" },
]

describe("matchFixedValues", () => {
  it("usa el nombre exacto cuando existe", () => {
    expect(matchFixedValues(["16:9"], OPTIONS).matched.map((o) => o.valueId)).toEqual([5180])
  })

  it("no usa proporciones verticales para valores horizontales", () => {
    const { matched, missing } = matchFixedValues(["3:2", "4:3"], OPTIONS)
    expect(matched).toEqual([])
    expect(missing).toEqual(["3:2", "4:3"])
  })

  it("informa de lo que no existe", () => {
    expect(matchFixedValues(["21:9"], OPTIONS).missing).toEqual(["21:9"])
  })
})
