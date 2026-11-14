import { describe, expect, it } from "vitest"
import { allowRequest, resetRateLimits } from "./rateLimit"

describe("rate limit", () => {
  it("corta al pasar el máximo y se reinicia con la ventana", () => {
    resetRateLimits()
    const now = 1_000_000
    for (let i = 0; i < 3; i++) expect(allowRequest("login:1.2.3.4", 3, 60_000, now)).toBe(true)
    expect(allowRequest("login:1.2.3.4", 3, 60_000, now)).toBe(false)
    expect(allowRequest("login:5.6.7.8", 3, 60_000, now)).toBe(true)
    expect(allowRequest("login:1.2.3.4", 3, 60_000, now + 61_000)).toBe(true)
  })
})
