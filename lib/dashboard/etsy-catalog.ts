import type Database from "better-sqlite3"
import type { EtsyTokenPayload } from "../etsy/auth"
import { etsyFetch } from "../etsy/client"
import type { DashboardPeriod } from "./overview"

type State = "active" | "draft" | "inactive"
type Listing = { listing_id: number; title?: string; state?: string; created_timestamp?: number;
  price?: { amount?: number; divisor?: number; currency_code?: string } }
type SyncRow = { shop_id: number; status: string; started_at: string; finished_at: string | null;
  last_success_at: string | null; error_code: string | null; active_count: number | null;
  draft_count: number | null; inactive_count: number | null; details_complete: number }

const states: State[] = ["active", "draft", "inactive"]
const PAGE_SIZE = 100
const MAX_PAGES = 10

export function getCatalogSnapshot(db: Database.Database, period: DashboardPeriod, connected: boolean, now = new Date()) {
  const sync = db.prepare("SELECT * FROM dashboard_etsy_sync ORDER BY COALESCE(last_success_at, started_at) DESC LIMIT 1").get() as SyncRow | undefined
  const days = Number.parseInt(period, 10)
  const from = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days + 1) / 1000)
  const created = sync?.last_success_at && sync.details_complete ? db.prepare(`SELECT COUNT(*) AS count FROM dashboard_etsy_listings
    WHERE shop_id = ? AND created_timestamp >= ? AND created_timestamp <= ?`).get(sync.shop_id, from, Math.floor(now.getTime() / 1000)) as { count: number } : null
  const listings = sync?.last_success_at ? db.prepare(`SELECT listing_id AS id, title, state, price_amount AS amount,
    price_divisor AS divisor, currency_code AS currency, created_timestamp AS createdAt FROM dashboard_etsy_listings
    WHERE shop_id = ? ORDER BY created_timestamp DESC LIMIT 12`).all(sync.shop_id) as Array<{
      id: number; title: string; state: string; amount: number | null; divisor: number | null;
      currency: string | null; createdAt: number | null }> : []
  return {
    connected, period, status: sync?.status || (connected ? "not_synced" : "not_connected"),
    lastSuccessAt: sync?.last_success_at || null, finishedAt: sync?.finished_at || null,
    errorCode: sync?.error_code || null, detailsComplete: Boolean(sync?.details_complete),
    counts: sync?.last_success_at ? { active: sync.active_count, draft: sync.draft_count, inactive: sync.inactive_count } : null,
    createdInPeriod: created?.count ?? null, listings,
  }
}

function classifyStatus(status: number) {
  if (status === 401) return "authentication_expired"
  if (status === 403) return "permission_denied"
  if (status === 429) return "rate_limited"
  return status >= 500 ? "etsy_unavailable" : "etsy_rejected"
}

export class CatalogSyncError extends Error {
  constructor(public readonly code: string, public readonly status = 502) { super(code) }
}

export async function syncEtsyCatalog(db: Database.Database, shopId: number, token: EtsyTokenPayload,
  fetchPage: typeof etsyFetch = etsyFetch, now = new Date()) {
  const startedAt = now.toISOString()
  const acquired = db.prepare(`INSERT INTO dashboard_etsy_sync (shop_id,status,started_at)
    VALUES (?,'running',?) ON CONFLICT(shop_id) DO UPDATE SET status='running',started_at=excluded.started_at,error_code=NULL
    WHERE (status != 'running' OR started_at < ?) AND (last_success_at IS NULL OR last_success_at < ?)`)
    .run(shopId, startedAt, new Date(now.getTime() - 5 * 60_000).toISOString(), new Date(now.getTime() - 15 * 60_000).toISOString())
  if (!acquired.changes) throw new CatalogSyncError("sync_recent_or_running", 409)

  const collected: Listing[] = []
  const counts: Record<State, number> = { active: 0, draft: 0, inactive: 0 }
  let complete = true
  try {
    for (const state of states) {
      for (let page = 0; page < MAX_PAGES; page++) {
        const response = await fetchPage(`/application/shops/${shopId}/listings?state=${state}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, token)
        if (!response.ok) throw new CatalogSyncError(classifyStatus(response.status), response.status === 429 ? 429 : 502)
        const body = await response.json() as { count?: unknown; results?: unknown }
        if (!Number.isSafeInteger(body.count) || Number(body.count) < 0 || !Array.isArray(body.results)) {
          throw new CatalogSyncError("invalid_etsy_response")
        }
        counts[state] = Number(body.count)
        const results = body.results as Listing[]
        for (const item of results) {
          if (Number.isSafeInteger(item.listing_id) && item.listing_id > 0) collected.push({ ...item, state })
        }
        if ((page + 1) * PAGE_SIZE >= counts[state]) break
        if (page === MAX_PAGES - 1) complete = false
      }
    }
    const finishedAt = now.toISOString()
    db.transaction(() => {
      db.prepare("DELETE FROM dashboard_etsy_listings WHERE shop_id = ?").run(shopId)
      const insert = db.prepare(`INSERT OR REPLACE INTO dashboard_etsy_listings
        (shop_id,listing_id,state,title,price_amount,price_divisor,currency_code,created_timestamp,synced_at)
        VALUES (?,?,?,?,?,?,?,?,?)`)
      for (const item of collected) {
        const price = item.price
        insert.run(shopId, item.listing_id, item.state, String(item.title || "").slice(0, 500),
          Number.isSafeInteger(price?.amount) ? price!.amount : null,
          Number.isSafeInteger(price?.divisor) && price!.divisor! > 0 ? price!.divisor : null,
          typeof price?.currency_code === "string" ? price.currency_code : null,
          Number.isSafeInteger(item.created_timestamp) ? item.created_timestamp : null, finishedAt)
      }
      db.prepare(`UPDATE dashboard_etsy_sync SET status=?,finished_at=?,last_success_at=?,error_code=NULL,
        active_count=?,draft_count=?,inactive_count=?,details_complete=? WHERE shop_id=?`)
        .run(complete ? "complete" : "partial", finishedAt, finishedAt,
          counts.active, counts.draft, counts.inactive, complete ? 1 : 0, shopId)
    })()
    return { status: complete ? "complete" : "partial", counts, fetched: collected.length }
  } catch (error) {
    const code = error instanceof CatalogSyncError ? error.code : "connection_failed"
    db.prepare("UPDATE dashboard_etsy_sync SET status='failed',finished_at=?,error_code=? WHERE shop_id=?")
      .run(new Date().toISOString(), code, shopId)
    throw error instanceof CatalogSyncError ? error : new CatalogSyncError(code)
  }
}
