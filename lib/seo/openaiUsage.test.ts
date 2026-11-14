import { describe, expect, it } from "vitest"
import { costOf, recordOpenAiUsage, withOpenAiUsage } from "./openaiUsage"

describe("openai usage", () => {
  it("suma las llamadas hechas dentro y calcula el coste", async () => {
    const { result, usage } = await withOpenAiUsage(async () => {
      recordOpenAiUsage({ input_tokens: 10_000, output_tokens: 1_000 })
      await Promise.resolve()
      recordOpenAiUsage({ input_tokens: 5_000, output_tokens: 500 })
      return "ok"
    })
    expect(result).toBe("ok")
    expect(usage).toMatchObject({ calls: 2, inputTokens: 15_000, outputTokens: 1_500 })
    expect(usage.costUsd).toBeCloseTo(costOf(15_000, 1_500))
    recordOpenAiUsage({ input_tokens: 1 }) // fuera de un trabajo: no hace nada
  })
})
