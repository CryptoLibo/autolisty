import { afterEach, describe, expect, it, vi } from "vitest"
import { openAutomationDatabase } from "../automation/db/database"
import { getCatalogSnapshot, syncEtsyCatalog } from "./etsy-catalog"
import type { EtsyTokenPayload } from "../etsy/auth"

const databases: ReturnType<typeof openAutomationDatabase>[] = []
const db = () => { const value = openAutomationDatabase(":memory:"); databases.push(value); return value }
const token = { access_token: "test", scope: ["shops_r", "listings_r"] } as EtsyTokenPayload
afterEach(() => { databases.splice(0).forEach((value) => value.close()) })

describe("Etsy dashboard catalog", () => {
  it("reads an empty cache without an Etsy request", () => {
    expect(getCatalogSnapshot(db(), "30d", true).status).toBe("not_synced")
  })

  it("stores real counts and creation dates from paginated results", async () => {
    const database = db()
    const fetchPage = vi.fn(async (path: string) => Response.json({ count: path.includes("state=active") ? 1 : 0,
      results: path.includes("state=active") ? [{ listing_id: 42, title: "Artwork", created_timestamp: 1793318400,
        price: { amount: 2500, divisor: 100, currency_code: "USD" } }] : [] }))
    await syncEtsyCatalog(database, 1, token, fetchPage as never, new Date("2026-10-30T12:00:00Z"))
    expect(fetchPage).toHaveBeenCalledTimes(5)
    const snapshot = getCatalogSnapshot(database, "7d", true, new Date("2026-10-30T12:01:00Z"))
    expect(snapshot.counts).toEqual({ active: 1, draft: 0, inactive: 0, expired: 0, soldOut: 0 })
    expect(snapshot.createdInPeriod).toBe(1)
    expect(snapshot.listings[0]).toMatchObject({ id: 42, amount: 2500, divisor: 100 })
  })

  it("keeps the last good snapshot after Etsy rejects a later sync", async () => {
    const database = db()
    const good = vi.fn(async () => Response.json({ count: 0, results: [] }))
    await syncEtsyCatalog(database, 1, token, good as never, new Date("2026-10-30T12:00:00Z"))
    const rejected = vi.fn(async () => new Response(null, { status: 429 }))
    await expect(syncEtsyCatalog(database, 1, token, rejected as never, new Date("2026-10-30T12:20:00Z")))
      .rejects.toMatchObject({ code: "rate_limited" })
    const snapshot = getCatalogSnapshot(database, "30d", true)
    expect(snapshot.status).toBe("failed")
    expect(snapshot.counts).toEqual({ active: 0, draft: 0, inactive: 0, expired: 0, soldOut: 0 })
  })

  it("does not start simultaneous or frequent syncs", async () => {
    const database = db()
    const good = vi.fn(async () => Response.json({ count: 0, results: [] }))
    await syncEtsyCatalog(database, 1, token, good as never, new Date("2026-10-30T12:00:00Z"))
    await expect(syncEtsyCatalog(database, 1, token, good as never, new Date("2026-10-30T12:01:00Z")))
      .rejects.toMatchObject({ code: "sync_recent_or_running" })
    expect(good).toHaveBeenCalledTimes(5)
  })

  it("keeps expired and sold-out listings separate from inactive", async () => {
    const database = db()
    const fetchPage = vi.fn(async (path: string) => {
      const state = new URL(`https://example.test${path}`).searchParams.get("state")
      const counts: Record<string, number> = { active: 114, draft: 6, inactive: 0, expired: 6, sold_out: 2 }
      const offset = Number(new URL(`https://example.test${path}`).searchParams.get("offset"))
      const count = counts[state || ""] || 0
      return Response.json({ count, results: Array.from({ length: Math.min(100, Math.max(0, count - offset)) }, (_, index) => ({
        listing_id: ["active", "draft", "inactive", "expired", "sold_out"].indexOf(state || "") * 1000 + offset + index + 1,
      })) })
    })
    await syncEtsyCatalog(database, 1, token, fetchPage as never, new Date("2026-10-30T12:00:00Z"))
    const snapshot = getCatalogSnapshot(database, "7d", true)
    expect(snapshot.counts).toEqual({ active: 114, draft: 6, inactive: 0, expired: 6, soldOut: 2 })
    expect(snapshot.renewalPending).toBe(6)
    expect(fetchPage).toHaveBeenCalledWith(expect.stringContaining("state=expired"), token)
    expect(fetchPage).toHaveBeenCalledWith(expect.stringContaining("state=sold_out"), token)
  })
})
