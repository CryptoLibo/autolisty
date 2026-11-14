import { describe, expect, it } from "vitest"
import { parseReviewHours, reviewPollDelayMs } from "./reviewPolling"

describe("comprobación de publicados", () => {
  it("cada 5 min en horas de revisión y cada 30 fuera", () => {
    const hours = parseReviewHours("14-24")
    // Noviembre: Lisboa = UTC.
    expect(reviewPollDelayMs(new Date("2026-11-14T20:00:00Z"), hours)).toBe(5 * 60_000)
    expect(reviewPollDelayMs(new Date("2026-11-14T08:00:00Z"), hours)).toBe(30 * 60_000)
    expect(reviewPollDelayMs(new Date("2026-11-14T23:30:00Z"), parseReviewHours("22-2"))).toBe(5 * 60_000)
    expect(parseReviewHours("x")).toEqual({ start: 14, end: 24 })
  })
})
