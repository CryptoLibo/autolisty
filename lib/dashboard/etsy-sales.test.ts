import Database from "better-sqlite3"
import { afterEach, describe, expect, it, vi } from "vitest"
import { openAutomationDatabase } from "../automation/db/database"
import { runAutomationMigrations } from "../automation/db/migrations"
import type { EtsyTokenPayload } from "../etsy/auth"
import { getSalesSnapshot, syncEtsySales } from "./etsy-sales"

const databases: Database.Database[] = []
const db = () => { const value = openAutomationDatabase(":memory:"); databases.push(value); return value }
const token = { access_token: "test", scope: ["shops_r", "transactions_r"] } as EtsyTokenPayload
const now = new Date("2026-10-30T12:00:00Z")
const timestamp = (date: string) => Math.floor(Date.parse(date) / 1000)
const amount = (value: number, currency = "USD") => ({ amount: value, divisor: 100, currency_code: currency })
const receipt = (id: number, status: string, date: string, value: number, currency = "USD") => ({
  receipt_id: id, status, created_timestamp: timestamp(date), updated_timestamp: timestamp(date),
  grandtotal: amount(value, currency), subtotal: amount(value - 300, currency),
  total_shipping_cost: amount(200, currency), total_tax_cost: amount(100, currency), discount_amt: amount(0, currency),
  buyer_email: "never-store@example.test", transactions: [{ transaction_id: id + 1000, listing_id: 7,
    quantity: 2, price: amount((value - 300) / 2, currency) }],
})
afterEach(() => { databases.splice(0).forEach((value) => value.close()) })

describe("Etsy sales cache", () => {
  it("migrates the existing v11 database without losing catalog data", () => {
    const database = new Database(":memory:")
    databases.push(database)
    expect(runAutomationMigrations(database, 11)).toBe(11)
    database.prepare("INSERT INTO dashboard_etsy_sync(shop_id,status,started_at) VALUES (1,'complete','2026-10-01')").run()
    expect(runAutomationMigrations(database)).toBe(12)
    expect(database.prepare("SELECT shop_id FROM dashboard_etsy_sync").get()).toEqual({ shop_id: 1 })
  })

  it("calculates paid orders, canceled orders, currency and previous period without buyer data", async () => {
    const database = db()
    const records = [receipt(1, "paid", "2026-10-29T10:00:00Z", 2500),
      receipt(2, "canceled", "2026-10-28T10:00:00Z", 3000),
      receipt(3, "completed", "2026-09-15T10:00:00Z", 4000)]
    const fetchPage = vi.fn(async (path: string) => {
      const canceled = new URL(`https://example.test${path}`).searchParams.get("was_canceled") === "true"
      const results = records.filter((item) => (item.status === "canceled") === canceled)
      return Response.json({ count: results.length, results })
    })
    await syncEtsySales(database, 1, token, fetchPage as never, now)
    const snapshot = getSalesSnapshot(database, "30d", true, true, now)
    expect(snapshot.complete).toBe(true)
    expect(snapshot.current).toMatchObject({ orders: 2, paid: 1, canceled: 1, completed: 0 })
    expect(snapshot.previous).toMatchObject({ orders: 1, paid: 1 })
    expect(snapshot.current?.currencies.USD).toMatchObject({ orderTotal: 25, itemSubtotal: 22, shipping: 2, tax: 1 })
    expect(snapshot.products).toMatchObject([{ listingId: 7, units: 2, lineTotal: 22 }])
    expect(snapshot.daily.filter((day) => day.orders)).toHaveLength(2)
    expect(JSON.stringify(database.prepare("SELECT * FROM dashboard_etsy_receipts").all())).not.toContain("never-store")
    expect(getSalesSnapshot(database, "90d", true, true, now).complete).toBe(true)
  })

  it("uses last-modified overlap and upserts a later cancellation without duplicates", async () => {
    const database = db()
    const first = vi.fn(async (path: string) => Response.json({ count: path.includes("was_canceled=false") ? 1 : 0,
      results: path.includes("was_canceled=false") ? [receipt(1, "paid", "2026-10-29T10:00:00Z", 2500)] : [] }))
    await syncEtsySales(database, 1, token, first as never, now)
    const second = vi.fn(async (path: string) => Response.json({ count: path.includes("was_canceled=true") ? 1 : 0,
      results: path.includes("was_canceled=true") ? [receipt(1, "canceled", "2026-10-29T10:00:00Z", 2500)] : [] }))
    await syncEtsySales(database, 1, token, second as never, new Date("2026-10-30T12:20:00Z"))
    expect(second.mock.calls[0][0]).toContain("min_last_modified=")
    expect(database.prepare("SELECT COUNT(*) AS count FROM dashboard_etsy_receipts").get()).toEqual({ count: 1 })
    expect(getSalesSnapshot(database, "7d", true, true, now).current).toMatchObject({ paid: 0, canceled: 1 })
  })

  it("keeps currencies separate", async () => {
    const database = db()
    const records = [receipt(1, "paid", "2026-10-29T10:00:00Z", 1000, "USD"),
      receipt(2, "paid", "2026-10-29T10:00:00Z", 2000, "EUR")]
    const fetchPage = vi.fn(async (path: string) => Response.json({ count: path.includes("was_canceled=true") ? 0 : 2,
      results: path.includes("was_canceled=true") ? [] : records }))
    await syncEtsySales(database, 1, token, fetchPage as never, now)
    expect(getSalesSnapshot(database, "7d", true, true, now).current?.currencies).toMatchObject({
      USD: { orderTotal: 10 }, EUR: { orderTotal: 20 },
    })
  })

  it("does not treat a refund field as seller proceeds or persist its details", async () => {
    const database = db()
    const refunded = { ...receipt(1, "paid", "2026-10-29T10:00:00Z", 2500), refunds: [{ amount: amount(1000), buyer_email: "private@example.test" }] }
    const fetchPage = vi.fn(async (path: string) => Response.json({ count: path.includes("was_canceled=true") ? 0 : 1,
      results: path.includes("was_canceled=true") ? [] : [refunded] }))
    await syncEtsySales(database, 1, token, fetchPage as never, now)
    const snapshot = getSalesSnapshot(database, "7d", true, true, now)
    expect(snapshot.current?.currencies.USD.orderTotal).toBe(25)
    expect(JSON.stringify(database.prepare("SELECT * FROM dashboard_etsy_receipts").all())).not.toContain("private@example.test")
    expect(getSalesSnapshot(database, "7d", true, false, now).current).toBeNull()
  })

  it("handles pagination and retains the previous snapshot on provider failure", async () => {
    const database = db()
    const fetchPage = vi.fn(async (path: string) => {
      const params = new URL(`https://example.test${path}`).searchParams
      if (params.get("was_canceled") === "true") return Response.json({ count: 0, results: [] })
      const offset = Number(params.get("offset"))
      return Response.json({ count: 101, results: Array.from({ length: offset ? 1 : 100 }, (_, index) =>
        receipt(offset + index + 1, "paid", "2026-10-29T10:00:00Z", 1000)) })
    })
    await syncEtsySales(database, 1, token, fetchPage as never, now)
    expect(fetchPage).toHaveBeenCalledTimes(3)
    expect(database.prepare("SELECT COUNT(*) AS count FROM dashboard_etsy_receipts").get()).toEqual({ count: 101 })
    await expect(syncEtsySales(database, 1, token,
      vi.fn(async () => new Response(null, { status: 429 })) as never, new Date("2026-10-30T12:20:00Z")))
      .rejects.toMatchObject({ code: "rate_limited" })
    const snapshot = getSalesSnapshot(database, "7d", true, true, now)
    expect(snapshot.status).toBe("failed")
    expect(snapshot.current?.orders).toBe(101)
  })

  it("marks page-limited responses partial without committing incomplete totals", async () => {
    const database = db()
    const fetchPage = vi.fn(async () => Response.json({ count: 1001, results: [] }))
    const result = await syncEtsySales(database, 1, token, fetchPage as never, now)
    expect(result.status).toBe("partial")
    expect(getSalesSnapshot(database, "30d", true, true, now).complete).toBe(false)
    expect(database.prepare("SELECT COUNT(*) AS count FROM dashboard_etsy_receipts").get()).toEqual({ count: 0 })
  })

  it("rejects a page sequence that reports more receipts than it delivers", async () => {
    const database = db()
    const fetchPage = vi.fn(async (path: string) => Response.json({ count: path.includes("was_canceled=true") ? 0 : 2,
      results: path.includes("was_canceled=true") ? [] : [receipt(1, "paid", "2026-10-29T10:00:00Z", 1000)] }))
    expect((await syncEtsySales(database, 1, token, fetchPage as never, now)).status).toBe("partial")
    expect(getSalesSnapshot(database, "7d", true, true, now).current).toBeNull()
  })
})
