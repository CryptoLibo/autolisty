import { describe, expect, it } from "vitest"
import { DEFAULT_PINTEREST_QUEUE_SETTINGS, isPinterestBlock, localDayKey, projectQueue, type PinChain } from "./pinterestQueue"

const settings = DEFAULT_PINTEREST_QUEUE_SETTINGS
const empty = { log: [], pausedUntil: null, lastAttemptAt: null }

function chain(jobId: string, boardId: string, nextIndex: number, dueIso: string): PinChain {
  return { jobId, productCode: jobId, boardId, nextIndex, total: 3, nextDueAt: new Date(dueIso) }
}

describe("cola de Pinterest", () => {
  it("separa los pines al menos 25 min y empieza a las 10:00 de Lisboa", () => {
    const now = new Date("2026-11-16T07:00:00Z")
    const out = projectQueue([chain("A", "b1", 1, "2026-11-16T06:00:00Z"), chain("B", "b2", 1, "2026-11-16T06:00:00Z")], empty, settings, now)
    expect(out[0].at.toISOString()).toBe("2026-11-16T10:00:00.000Z")
    expect(out[1].at.toISOString()).toBe("2026-11-16T10:25:00.000Z")
  })

  it("prioriza los pines 1 de listings nuevos y deja 24 h entre pines del mismo listing", () => {
    const now = new Date("2026-11-16T12:00:00Z")
    const out = projectQueue([
      chain("OLD", "b1", 3, "2026-11-16T09:00:00Z"),
      chain("NEW", "b2", 1, "2026-11-16T11:00:00Z"),
    ], empty, settings, now)
    expect(out.map((pin) => `${pin.jobId}#${pin.index}`).slice(0, 2)).toEqual(["NEW#1", "OLD#3"])
    const newPins = out.filter((pin) => pin.jobId === "NEW")
    expect(newPins[1].at.getTime() - newPins[0].at.getTime()).toBeGreaterThanOrEqual(24 * 3_600_000)
  })

  it("alterna tableros entre pines del mismo grupo", () => {
    const now = new Date("2026-11-16T12:00:00Z")
    const out = projectQueue([
      chain("A", "frame", 1, "2026-11-16T09:00:00Z"),
      chain("B", "frame", 1, "2026-11-16T09:10:00Z"),
      chain("C", "png", 1, "2026-11-16T09:20:00Z"),
    ], empty, settings, now)
    expect(out.slice(0, 3).map((pin) => pin.jobId)).toEqual(["A", "C", "B"])
  })

  it("no pasa de 30 pines al día: lo que sobra va al día siguiente", () => {
    const now = new Date("2026-11-16T10:00:00Z")
    const chains = Array.from({ length: 40 }, (_, index) => chain(`J${index}`, `b${index % 5}`, 1, "2026-11-16T09:00:00Z"))
    const out = projectQueue(chains, empty, settings, now)
    const perDay = new Map<string, number>()
    for (const pin of out) perDay.set(localDayKey(pin.at, settings.timeZone), (perDay.get(localDayKey(pin.at, settings.timeZone)) || 0) + 1)
    expect(perDay.get("2026-11-16")).toBeLessThanOrEqual(30)
    expect(out.filter((pin) => pin.index === 1)).toHaveLength(40)
  })

  it("cuenta los pines ya publicados hoy (p. ej. una ráfaga anterior)", () => {
    const now = new Date("2026-11-15T12:00:00Z")
    const log = Array.from({ length: 80 }, (_, index) => ({ at: new Date(Date.parse("2026-11-15T09:00:00Z") + index * 20_000).toISOString(), boardId: "b" }))
    const out = projectQueue([chain("A", "b", 1, "2026-11-15T11:00:00Z")], { ...empty, log }, settings, now)
    expect(out[0].at.toISOString()).toBe("2026-11-16T10:00:00.000Z")
  })

  it("respeta la pausa por bloqueo", () => {
    const now = new Date("2026-11-16T12:00:00Z")
    const out = projectQueue([chain("A", "b", 1, "2026-11-16T11:00:00Z")], { ...empty, pausedUntil: new Date("2026-11-16T18:00:00Z") }, settings, now)
    expect(out[0].at.toISOString()).toBe("2026-11-16T18:00:00.000Z")
  })

  it("reconoce el bloqueo temporal de Pinterest", () => {
    expect(isPinterestBlock(new Error('Pinterest pin request failed (HTTP 429): {"code":9,"message":"block (Pins) in place to combat spam"}'))).toBe(true)
    expect(isPinterestBlock(new Error("Pinterest pin request failed (HTTP 400): invalid board"))).toBe(false)
  })
})
