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

  it("si Etsy solo tiene la proporción vertical, la usa para la horizontal", () => {
    const { matched, missing } = matchFixedValues(["3:2", "4:3", "5:4", "14:11", "7:5 (ISO ratio)"], OPTIONS)
    expect(matched.map((o) => o.name)).toEqual(["2:3", "3:4", "4:5", "11:14", "5:7 (ISO ratio)"])
    expect(missing).toEqual([])
  })

  it("informa de lo que no existe", () => {
    expect(matchFixedValues(["21:9"], OPTIONS).missing).toEqual(["21:9"])
  })
})
