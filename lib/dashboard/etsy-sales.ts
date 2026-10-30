import type Database from "better-sqlite3"
import type { EtsyTokenPayload } from "../etsy/auth"
import { etsyFetch } from "../etsy/client"
import type { DashboardPeriod } from "./overview"

type Money = { amount?: unknown; divisor?: unknown; currency_code?: unknown }
type Transaction = { transaction_id?: unknown; listing_id?: unknown; quantity?: unknown; price?: Money }
type Receipt = { receipt_id?: unknown; status?: unknown; created_timestamp?: unknown;
  updated_timestamp?: unknown; last_modified_timestamp?: unknown; grandtotal?: Money; subtotal?: Money;
  total_shipping_cost?: Money; total_tax_cost?: Money; discount_amt?: Money; transactions?: unknown }
type SyncRow = { shop_id: number; status: string; started_at: string; finished_at: string | null;
  last_success_at: string | null; coverage_from: number | null; coverage_to: number | null;
  error_code: string | null; details_complete: number }
type StoredReceipt = { receipt_id: number; status: string; created_timestamp: number; currency_code: string | null;
  grand_amount: number | null; grand_divisor: number | null; subtotal_amount: number | null;
  subtotal_divisor: number | null; shipping_amount: number | null; shipping_divisor: number | null;
  tax_amount: number | null; tax_divisor: number | null; discount_amount: number | null; discount_divisor: number | null;
  transactions_complete: number }

const PAGE_SIZE = 100
const MAX_PAGES = 10
const moneyFields = ["grandtotal", "subtotal", "total_shipping_cost", "total_tax_cost", "discount_amt"] as const

export class SalesSyncError extends Error {
  constructor(public readonly code: string, public readonly status = 502) { super(code) }
}

function money(value: Money | undefined) {
  if (!value || !Number.isSafeInteger(value.amount) || !Number.isSafeInteger(value.divisor) ||
    Number(value.divisor) <= 0 || typeof value.currency_code !== "string" || !/^[A-Z]{3}$/.test(value.currency_code)) return null
  return { amount: Number(value.amount), divisor: Number(value.divisor), currency: value.currency_code }
}

function providerError(status: number) {
  if (status === 401) return new SalesSyncError("authentication_expired", 401)
  if (status === 403) return new SalesSyncError("permission_denied", 403)
  if (status === 429) return new SalesSyncError("rate_limited", 429)
  return new SalesSyncError(status >= 500 ? "etsy_unavailable" : "etsy_rejected")
}

function parseReceipt(raw: Receipt) {
  if (!Number.isSafeInteger(raw.receipt_id) || Number(raw.receipt_id) <= 0 ||
    !Number.isSafeInteger(raw.created_timestamp) || Number(raw.created_timestamp) <= 0 ||
    typeof raw.status !== "string") throw new SalesSyncError("invalid_etsy_response")
  const totals = money(raw.grandtotal)
  const parts = Object.fromEntries(moneyFields.map((field) => [field, money(raw[field])])) as Record<typeof moneyFields[number], ReturnType<typeof money>>
  const currency = totals?.currency || parts.subtotal?.currency || null
  for (const field of moneyFields) if (parts[field] && currency && parts[field]!.currency !== currency) parts[field] = null
  const transactions = Array.isArray(raw.transactions) ? raw.transactions as Transaction[] : null
  return { id: Number(raw.receipt_id), status: raw.status.toLowerCase(), created: Number(raw.created_timestamp),
    updated: Number.isSafeInteger(raw.updated_timestamp) ? Number(raw.updated_timestamp) :
      Number.isSafeInteger(raw.last_modified_timestamp) ? Number(raw.last_modified_timestamp) : null,
    currency, totals, parts, transactions }
}

export async function syncEtsySales(db: Database.Database, shopId: number, token: EtsyTokenPayload,
  fetchPage: typeof etsyFetch = etsyFetch, now = new Date()) {
  const previous = db.prepare("SELECT * FROM dashboard_etsy_sales_sync WHERE shop_id=?").get(shopId) as SyncRow | undefined
  const startedAt = now.toISOString()
  const minimum = startOfPeriod("90d", now) - 90 * 86400
  const incremental = Boolean(previous?.last_success_at && previous.details_complete && previous.coverage_from != null)
  const since = incremental ? Math.max(minimum, Math.floor(Date.parse(previous!.last_success_at!) / 1000) - 86400) : minimum
  const filter = incremental ? "min_last_modified" : "min_created"
  const acquired = db.prepare(`INSERT INTO dashboard_etsy_sales_sync (shop_id,status,started_at)
    VALUES (?,'running',?) ON CONFLICT(shop_id) DO UPDATE SET status='running',started_at=excluded.started_at,error_code=NULL
    WHERE (status != 'running' OR started_at < ?) AND (last_success_at IS NULL OR last_success_at < ?)`)
    .run(shopId, startedAt, new Date(now.getTime() - 5 * 60_000).toISOString(), new Date(now.getTime() - 15 * 60_000).toISOString())
  if (!acquired.changes) throw new SalesSyncError("sync_recent_or_running", 409)

  const receipts = new Map<number, ReturnType<typeof parseReceipt>>()
  let complete = true
  let requests = 0
  try {
    for (const canceled of [false, true]) {
      const seen = new Set<number>()
      let expected = 0
      for (let page = 0; page < MAX_PAGES; page++) {
        if (requests++ && fetchPage === etsyFetch) await new Promise((resolve) => setTimeout(resolve, 250))
        const params = new URLSearchParams({ [filter]: String(since), limit: String(PAGE_SIZE),
          offset: String(page * PAGE_SIZE), was_canceled: String(canceled),
          sort_on: incremental ? "updated" : "created", sort_order: "asc" })
        const response = await fetchPage(`/application/shops/${shopId}/receipts?${params}`, token)
        if (!response.ok) throw providerError(response.status)
        const body = await response.json() as { count?: unknown; results?: unknown }
        if (!Number.isSafeInteger(body.count) || Number(body.count) < 0 || !Array.isArray(body.results)) {
          throw new SalesSyncError("invalid_etsy_response")
        }
        expected = Number(body.count)
        for (const item of body.results as Receipt[]) {
          const parsed = parseReceipt(item)
          seen.add(parsed.id)
          receipts.set(parsed.id, parsed)
        }
        if ((page + 1) * PAGE_SIZE >= expected) break
        if (page === MAX_PAGES - 1) complete = false
      }
      if (seen.size < expected) complete = false
    }
    if (!complete) {
      db.prepare("UPDATE dashboard_etsy_sales_sync SET status='partial',finished_at=?,error_code='page_limit' WHERE shop_id=?")
        .run(startedAt, shopId)
      return { status: "partial", fetched: receipts.size }
    }
    db.transaction(() => {
      const insertReceipt = db.prepare(`INSERT INTO dashboard_etsy_receipts
        (shop_id,receipt_id,status,created_timestamp,updated_timestamp,currency_code,grand_amount,grand_divisor,
         subtotal_amount,subtotal_divisor,shipping_amount,shipping_divisor,tax_amount,tax_divisor,discount_amount,discount_divisor,transactions_complete)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(shop_id,receipt_id) DO UPDATE SET
        status=excluded.status,created_timestamp=excluded.created_timestamp,updated_timestamp=excluded.updated_timestamp,
        currency_code=excluded.currency_code,grand_amount=excluded.grand_amount,grand_divisor=excluded.grand_divisor,
        subtotal_amount=excluded.subtotal_amount,subtotal_divisor=excluded.subtotal_divisor,
        shipping_amount=excluded.shipping_amount,shipping_divisor=excluded.shipping_divisor,
        tax_amount=excluded.tax_amount,tax_divisor=excluded.tax_divisor,
        discount_amount=excluded.discount_amount,discount_divisor=excluded.discount_divisor,
        transactions_complete=excluded.transactions_complete`)
      const deleteTransactions = db.prepare("DELETE FROM dashboard_etsy_transactions WHERE shop_id=? AND receipt_id=?")
      const insertTransaction = db.prepare(`INSERT OR REPLACE INTO dashboard_etsy_transactions
        (shop_id,receipt_id,transaction_id,listing_id,quantity,price_amount,price_divisor,currency_code)
        VALUES (?,?,?,?,?,?,?,?)`)
      for (const receipt of receipts.values()) {
        const { parts, totals } = receipt
        const transactionsComplete = Boolean(receipt.transactions?.length && receipt.transactions.every((item) =>
          Number.isSafeInteger(item.transaction_id) && Number(item.transaction_id) > 0 &&
          Number.isSafeInteger(item.listing_id) && Number(item.listing_id) > 0 &&
          Number.isSafeInteger(item.quantity) && Number(item.quantity) >= 0))
        insertReceipt.run(shopId, receipt.id, receipt.status, receipt.created, receipt.updated, receipt.currency,
          totals?.amount ?? null, totals?.divisor ?? null, parts.subtotal?.amount ?? null, parts.subtotal?.divisor ?? null,
          parts.total_shipping_cost?.amount ?? null, parts.total_shipping_cost?.divisor ?? null,
          parts.total_tax_cost?.amount ?? null, parts.total_tax_cost?.divisor ?? null,
          parts.discount_amt?.amount ?? null, parts.discount_amt?.divisor ?? null, transactionsComplete ? 1 : 0)
        if (receipt.transactions) {
          deleteTransactions.run(shopId, receipt.id)
          for (const item of receipt.transactions) {
            if (!Number.isSafeInteger(item.transaction_id) || Number(item.transaction_id) <= 0 ||
              !Number.isSafeInteger(item.quantity) || Number(item.quantity) < 0) continue
            const price = money(item.price)
            insertTransaction.run(shopId, receipt.id, Number(item.transaction_id),
              Number.isSafeInteger(item.listing_id) ? Number(item.listing_id) : null,
              Number(item.quantity), price?.amount ?? null, price?.divisor ?? null, price?.currency ?? null)
          }
        }
      }
      db.prepare(`UPDATE dashboard_etsy_sales_sync SET status='complete',finished_at=?,last_success_at=?,
        coverage_from=?,coverage_to=?,error_code=NULL,details_complete=1 WHERE shop_id=?`)
        .run(startedAt, startedAt, incremental ? previous!.coverage_from : minimum,
          Math.floor(now.getTime() / 1000), shopId)
    })()
    return { status: "complete", fetched: receipts.size, incremental }
  } catch (error) {
    const code = error instanceof SalesSyncError ? error.code : "connection_failed"
    db.prepare("UPDATE dashboard_etsy_sales_sync SET status='failed',finished_at=?,error_code=? WHERE shop_id=?")
      .run(new Date().toISOString(), code, shopId)
    throw error instanceof SalesSyncError ? error : new SalesSyncError(code)
  }
}

function startOfPeriod(period: DashboardPeriod, now: Date) {
  const days = Number.parseInt(period, 10)
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days + 1) / 1000)
}

export function getSalesSnapshot(db: Database.Database, period: DashboardPeriod, connected: boolean,
  authorized: boolean, now = new Date()) {
  const sync = db.prepare("SELECT * FROM dashboard_etsy_sales_sync ORDER BY COALESCE(last_success_at,started_at) DESC LIMIT 1")
    .get() as SyncRow | undefined
  const from = startOfPeriod(period, now)
  const days = Number.parseInt(period, 10)
  const previousFrom = from - days * 86400
  const covered = Boolean(connected && authorized && sync?.last_success_at && sync.details_complete &&
    sync.coverage_from != null && sync.coverage_from <= previousFrom)
  const rows = covered ? db.prepare(`SELECT receipt_id,status,created_timestamp,currency_code,grand_amount,grand_divisor,
    subtotal_amount,subtotal_divisor,shipping_amount,shipping_divisor,tax_amount,tax_divisor,
    discount_amount,discount_divisor,transactions_complete FROM dashboard_etsy_receipts
    WHERE shop_id=? AND created_timestamp >= ? AND created_timestamp <= ?`)
    .all(sync!.shop_id, previousFrom, Math.floor(now.getTime() / 1000)) as StoredReceipt[] : []
  const summarize = (start: number, end: number) => {
    const matching = rows.filter((row) => row.created_timestamp >= start && row.created_timestamp < end)
    const paid = matching.filter((row) => row.status === "paid" || row.status === "completed")
    const byCurrency: Record<string, { orderTotal: number; itemSubtotal: number | null;
      shipping: number | null; tax: number | null; discount: number | null; orders: number }> = {}
    for (const row of paid) {
      if (!row.currency_code || !row.grand_divisor || row.grand_amount == null) continue
      const bucket = byCurrency[row.currency_code] ||= { orderTotal: 0, itemSubtotal: 0,
        shipping: 0, tax: 0, discount: 0, orders: 0 }
      bucket.orders++
      bucket.orderTotal += row.grand_amount / row.grand_divisor
      for (const [name, amount, divisor] of [
        ["itemSubtotal", row.subtotal_amount, row.subtotal_divisor],
        ["shipping", row.shipping_amount, row.shipping_divisor],
        ["tax", row.tax_amount, row.tax_divisor],
        ["discount", row.discount_amount, row.discount_divisor],
      ] as const) bucket[name] = bucket[name] == null || amount == null || !divisor ? null : bucket[name]! + amount / divisor
    }
    const financialComplete = paid.every((row) => row.currency_code && row.grand_amount != null && row.grand_divisor)
    return { orders: matching.length, paid: paid.length, financialComplete,
      canceled: matching.filter((row) => row.status === "canceled").length,
      completed: matching.filter((row) => row.status === "completed").length,
      currencies: byCurrency }
  }
  const current = covered ? summarize(from, Math.floor(now.getTime() / 1000) + 1) : null
  const previous = covered ? summarize(previousFrom, from) : null
  const daily = covered ? Array.from({ length: days }, (_, index) => {
    const day = from + index * 86400
    return { date: new Date(day * 1000).toISOString().slice(0, 10), ...summarize(day, day + 86400) }
  }) : []
  const productReady = covered && rows.filter((row) => row.created_timestamp >= from &&
    (row.status === "paid" || row.status === "completed")).every((row) => row.transactions_complete === 1)
  const productRows = productReady ? db.prepare(`SELECT t.listing_id AS listingId, SUM(t.quantity) AS units,
    t.currency_code AS currency, SUM(t.price_amount * t.quantity * 1.0 / t.price_divisor) AS lineTotal,
    COUNT(*) AS lines, SUM(CASE WHEN t.price_amount IS NOT NULL AND t.price_divisor > 0 THEN 1 ELSE 0 END) AS pricedLines
    FROM dashboard_etsy_transactions t JOIN dashboard_etsy_receipts r
      ON r.shop_id=t.shop_id AND r.receipt_id=t.receipt_id
    WHERE t.shop_id=? AND r.created_timestamp >= ? AND r.created_timestamp <= ? AND r.status IN ('paid','completed')
    GROUP BY t.listing_id,t.currency_code ORDER BY units DESC LIMIT 10`)
    .all(sync!.shop_id, from, Math.floor(now.getTime() / 1000)) as Array<{
      listingId: number | null; units: number; currency: string | null; lineTotal: number | null;
      lines: number; pricedLines: number }> : []
  return { connected, authorized, period, status: !connected ? "not_connected" : !authorized ? "missing_scope" : sync?.status || "not_synced",
    lastSuccessAt: sync?.last_success_at || null, coverageFrom: sync?.coverage_from || null,
    coverageTo: sync?.coverage_to || null, errorCode: sync?.error_code || null,
    complete: covered, current, previous, daily, productReady,
    products: productRows.map((row) => ({ listingId: row.listingId, units: row.units,
      currency: row.currency, lineTotal: row.lines === row.pricedLines ? row.lineTotal : null })) }
}
