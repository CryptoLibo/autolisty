import type Database from "better-sqlite3"
import type { PinterestTokenPayload } from "../pinterest/auth"
import { pinterestFetch } from "../pinterest/client"
import type { DashboardPeriod } from "./overview"

export const PINTEREST_ANALYTICS_SCOPES = ["user_accounts:read", "pins:read"] as const
const METRICS = ["IMPRESSION", "SAVE", "PIN_CLICK", "OUTBOUND_CLICK", "ENGAGEMENT"] as const
const PERIODS = ["7d", "30d", "90d"] as const
const MAX_PIN_PAGES = 4

type MetricValues = { impressions: number | null; saves: number | null; pinClicks: number | null;
  outboundClicks: number | null; engagements: number | null }
type AccountResponse = Record<string, { summary_metrics?: Record<string, unknown>;
  daily_metrics?: Array<{ date?: string; data_status?: string; metrics?: Record<string, unknown> }> }>
type TopResponse = { pins?: Array<{ pin_id?: string; metrics?: Record<string, unknown> }> }
type Pin = { id?: string; board_id?: string; title?: string; link?: string; created_at?: string;
  media?: { images?: Record<string,{url?: string}> } }
type DailyRow = { day: string; impressions: number | null; saves: number | null; pinClicks: number | null;
  outboundClicks: number | null; engagements: number | null }
type TopRow = { id: string; title: string | null; imageUrl: string | null; boardId: string | null;
  destinationUrl: string | null; listingId: number | null; publishedAt: string | null;
  impressions: number | null; saves: number | null; pinClicks: number | null;
  outboundClicks: number | null; engagements: number | null }
type LinkedRow = { listingId: number; pinCount: number; impressions: number | null; saves: number | null; outboundClicks: number | null }

export class PinterestAnalyticsError extends Error {
  constructor(public readonly code: string, public readonly status = 502) { super(code) }
}
export function hasPinterestAnalyticsScopes(scopes: readonly string[]) {
  return PINTEREST_ANALYTICS_SCOPES.every((scope) => scopes.includes(scope))
}
function safeMetric(input: Record<string, unknown> | undefined, key: string) {
  const value = input?.[key]
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null
}
function metrics(input?: Record<string, unknown>): MetricValues {
  return { impressions: safeMetric(input,"IMPRESSION"), saves: safeMetric(input,"SAVE"),
    pinClicks: safeMetric(input,"PIN_CLICK"), outboundClicks: safeMetric(input,"OUTBOUND_CLICK"),
    engagements: safeMetric(input,"ENGAGEMENT") }
}
function isDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) }
function datesFor(period: DashboardPeriod, now: Date) {
  const end = now.toISOString().slice(0,10)
  const from = new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate() - Number.parseInt(period,10) + 1)).toISOString().slice(0,10)
  return { from, end }
}
function accountGroup(body: AccountResponse) {
  const group = body.ALL ?? body.all ?? Object.values(body).find((value) => value && typeof value === "object" && "summary_metrics" in value)
  if (!group || typeof group.summary_metrics !== "object" || !Array.isArray(group.daily_metrics)) {
    throw new PinterestAnalyticsError("invalid_account_response")
  }
  return group
}
async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const code = response.status === 401 ? "authentication_expired" : response.status === 403 ? "permission_or_account_denied" :
      response.status === 429 ? "rate_limited" : response.status >= 500 ? "pinterest_unavailable" : "pinterest_rejected"
    throw new PinterestAnalyticsError(code, response.status === 429 ? 429 : response.status === 401 || response.status === 403 ? response.status : 502)
  }
  try { return await response.json() as T } catch { throw new PinterestAnalyticsError("invalid_json_response") }
}
export function etsyListingIdFromUrl(value: string | null | undefined): number | null {
  if (!value || value.length > 2048) return null
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || !["etsy.com","www.etsy.com"].includes(url.hostname.toLowerCase())) return null
    const match = /^\/listing\/(\d+)(?:\/|$)/.exec(url.pathname)
    const id = match ? Number(match[1]) : NaN
    return Number.isSafeInteger(id) && id > 0 ? id : null
  } catch { return null }
}
export function recordPublishedPin(db: Database.Database, input: { pinId: string; boardId: string; title?: string;
  destinationUrl?: string; imageUrl?: string }) {
  if (!/^\d{1,32}$/.test(input.pinId) || !/^\d{1,32}$/.test(input.boardId)) throw new PinterestAnalyticsError("invalid_published_pin")
  const now = new Date().toISOString()
  const listingId = etsyListingIdFromUrl(input.destinationUrl)
  db.prepare(`INSERT INTO dashboard_pinterest_pins (pin_id,board_id,title,image_url,destination_url,listing_id,listing_source,published_at,published_via_autolisty,updated_at)
    VALUES (?,?,?,?,?,?,?,?,1,?) ON CONFLICT(pin_id) DO UPDATE SET
    board_id=excluded.board_id,title=excluded.title,image_url=excluded.image_url,destination_url=excluded.destination_url,
    listing_id=excluded.listing_id,listing_source=excluded.listing_source,published_via_autolisty=1,updated_at=excluded.updated_at`)
    .run(input.pinId,input.boardId,(input.title ?? "").slice(0,500),input.imageUrl?.slice(0,2048) ?? null,
      input.destinationUrl?.slice(0,2048) ?? null,listingId,listingId ? "destination_url" : null,now,now)
}
export async function syncPinterestAnalytics(db: Database.Database, token: PinterestTokenPayload, period: DashboardPeriod,
  fetcher: typeof pinterestFetch = pinterestFetch, now = new Date()) {
  if (!PERIODS.includes(period)) throw new PinterestAnalyticsError("invalid_period",400)
  if (!hasPinterestAnalyticsScopes(token.scope)) throw new PinterestAnalyticsError("missing_scope",403)
  const user = await readResponse<{id?: unknown;account_type?: unknown}>(await fetcher("/user_account",token))
  if (typeof user.id !== "string" || !/^\d{1,32}$/.test(user.id)) throw new PinterestAnalyticsError("invalid_account_id")
  const accountId = user.id
  const startedAt = now.toISOString()
  const staleAt = new Date(now.getTime()-5*60_000).toISOString()
  const recentAt = new Date(now.getTime()-10*60_000).toISOString()
  const acquired = db.prepare(`INSERT INTO dashboard_pinterest_sync(account_id,status,started_at) VALUES (?,'running',?)
    ON CONFLICT(account_id) DO UPDATE SET status='running',started_at=excluded.started_at,error_code=NULL
    WHERE (status!='running' OR started_at<?) AND (last_success_at IS NULL OR last_success_at<?)`)
    .run(accountId,startedAt,staleAt,recentAt)
  if (!acquired.changes) throw new PinterestAnalyticsError("sync_recent_or_running",409)
  try {
    const accountData: Array<{ period: DashboardPeriod; from: string; end: string; summary: MetricValues;
      days: Array<{ day: string; values: MetricValues }> }> = []
    for (const item of PERIODS) {
      const {from,end} = datesFor(item,now)
      const query = new URLSearchParams({start_date:from,end_date:end,content_type:"ORGANIC",
        metric_types:METRICS.join(",")})
      const response = accountGroup(await readResponse<AccountResponse>(await fetcher(`/user_account/analytics?${query}`,token)))
      const days = response.daily_metrics!.filter((entry) => typeof entry.date === "string" && isDate(entry.date) && entry.date >= from && entry.date <= end && entry.data_status !== "PROCESSING")
        .map((entry) => ({day:entry.date!,values:metrics(entry.metrics)}))
      accountData.push({period:item,from,end,summary:metrics(response.summary_metrics),days})
    }
    const {from,end} = datesFor(period,now)
    const topQuery = new URLSearchParams({start_date:from,end_date:end,sort_by:"IMPRESSION",content_type:"ORGANIC",
      metric_types:METRICS.join(","),num_of_pins:"50",created_in_last_n_days:"90"})
    const top = await readResponse<TopResponse>(await fetcher(`/user_account/analytics/top_pins?${topQuery}`,token))
    if (top.pins !== undefined && !Array.isArray(top.pins)) throw new PinterestAnalyticsError("invalid_top_pins_response")
    const seen = new Set<string>()
    const topPins = (top.pins ?? []).filter((pin) => {
      if (typeof pin.pin_id !== "string" || !/^\d{1,32}$/.test(pin.pin_id) || seen.has(pin.pin_id)) return false
      seen.add(pin.pin_id);return true
    }).slice(0,50)
    const pins: Pin[] = []; let bookmark: string | null = null; let pinsComplete = false
    const bookmarks = new Set<string>()
    for (let page=0;page<MAX_PIN_PAGES;page++) {
      const query = new URLSearchParams({page_size:"250"})
      if (bookmark) query.set("bookmark",bookmark)
      const response = await readResponse<{items?:Pin[];bookmark?:string|null}>(await fetcher(`/pins?${query}`,token))
      if (!Array.isArray(response.items)) throw new PinterestAnalyticsError("invalid_pins_response")
      pins.push(...response.items)
      bookmark = typeof response.bookmark === "string" && response.bookmark ? response.bookmark : null
      if (!bookmark) { pinsComplete=true;break }
      if (bookmarks.has(bookmark)) throw new PinterestAnalyticsError("repeated_pagination_cursor")
      bookmarks.add(bookmark)
    }
    const finishedAt = now.toISOString()
    const validDays = accountData.find((item) => item.period === "90d")!.days
    const complete = pinsComplete && accountData.every((item) => Object.values(item.summary).every((value) => value !== null))
    db.transaction(() => {
      const savePeriod = db.prepare(`INSERT INTO dashboard_pinterest_periods
        (account_id,period,coverage_from,coverage_to,impressions,saves,pin_clicks,outbound_clicks,engagements,fetched_at)
        VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(account_id,period) DO UPDATE SET
        coverage_from=excluded.coverage_from,coverage_to=excluded.coverage_to,impressions=excluded.impressions,saves=excluded.saves,
        pin_clicks=excluded.pin_clicks,outbound_clicks=excluded.outbound_clicks,engagements=excluded.engagements,fetched_at=excluded.fetched_at`)
      for (const item of accountData) savePeriod.run(accountId,item.period,item.from,item.end,item.summary.impressions,item.summary.saves,
        item.summary.pinClicks,item.summary.outboundClicks,item.summary.engagements,finishedAt)
      const saveDay = db.prepare(`INSERT INTO dashboard_pinterest_daily
        (account_id,day,impressions,saves,pin_clicks,outbound_clicks,engagements,fetched_at) VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(account_id,day) DO UPDATE SET impressions=excluded.impressions,saves=excluded.saves,
        pin_clicks=excluded.pin_clicks,outbound_clicks=excluded.outbound_clicks,engagements=excluded.engagements,fetched_at=excluded.fetched_at`)
      for (const item of validDays) saveDay.run(accountId,item.day,item.values.impressions,item.values.saves,item.values.pinClicks,
        item.values.outboundClicks,item.values.engagements,finishedAt)
      db.prepare("DELETE FROM dashboard_pinterest_top_pins WHERE account_id=? AND period=?").run(accountId,period)
      const saveTop = db.prepare(`INSERT INTO dashboard_pinterest_top_pins
        (account_id,period,pin_id,impressions,saves,pin_clicks,outbound_clicks,engagements,fetched_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      for (const item of topPins) {
        const value = metrics(item.metrics)
        saveTop.run(accountId,period,item.pin_id,value.impressions,value.saves,value.pinClicks,value.outboundClicks,value.engagements,finishedAt)
      }
      db.prepare(`INSERT INTO dashboard_pinterest_top_sync (account_id,period,status,fetched_at,coverage_from,coverage_to)
        VALUES (?,?,?,?,?,?) ON CONFLICT(account_id,period) DO UPDATE SET status=excluded.status,fetched_at=excluded.fetched_at,
        coverage_from=excluded.coverage_from,coverage_to=excluded.coverage_to`).run(accountId,period,"complete",finishedAt,from,end)
      const savePin = db.prepare(`INSERT INTO dashboard_pinterest_pins
        (pin_id,account_id,board_id,title,image_url,destination_url,listing_id,listing_source,published_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(pin_id) DO UPDATE SET account_id=excluded.account_id,board_id=excluded.board_id,
        title=excluded.title,image_url=excluded.image_url,destination_url=excluded.destination_url,
        listing_id=COALESCE(dashboard_pinterest_pins.listing_id,excluded.listing_id),
        listing_source=COALESCE(dashboard_pinterest_pins.listing_source,excluded.listing_source),
        published_at=COALESCE(dashboard_pinterest_pins.published_at,excluded.published_at),updated_at=excluded.updated_at`)
      for (const pin of pins) {
        if (typeof pin.id !== "string" || !/^\d{1,32}$/.test(pin.id)) continue
        const destination = typeof pin.link === "string" ? pin.link.slice(0,2048) : null
        const listingId = etsyListingIdFromUrl(destination)
        savePin.run(pin.id,accountId,typeof pin.board_id === "string" ? pin.board_id : null,
          typeof pin.title === "string" ? pin.title.slice(0,500) : null,
          pin.media?.images?.["150x150"]?.url?.slice(0,2048) ?? null,destination,listingId,
          listingId ? "destination_url" : null,typeof pin.created_at === "string" ? pin.created_at : null,finishedAt)
      }
      db.prepare(`UPDATE dashboard_pinterest_sync SET status=?,finished_at=?,last_success_at=?,coverage_from=?,coverage_to=?,
        error_code=NULL,pins_complete=? WHERE account_id=?`).run(complete?"complete":"partial",finishedAt,finishedAt,
        accountData[2].from,accountData[2].end,pinsComplete?1:0,accountId)
    })()
    return { status:complete?"complete":"partial",pinsFetched:pins.length,topPins:topPins.length,pinsComplete }
  } catch (error) {
    const code = error instanceof PinterestAnalyticsError ? error.code : "connection_failed"
    db.prepare("UPDATE dashboard_pinterest_sync SET status='failed',finished_at=?,error_code=? WHERE account_id=?")
      .run(new Date().toISOString(),code,accountId)
    throw error instanceof PinterestAnalyticsError ? error : new PinterestAnalyticsError(code)
  }
}

export function getPinterestSnapshot(db: Database.Database, period: DashboardPeriod, connected: boolean,
  authorized: boolean, now = new Date()) {
  const sync = db.prepare(`SELECT * FROM dashboard_pinterest_sync ORDER BY COALESCE(last_success_at,started_at) DESC LIMIT 1`).get() as
    {account_id:string;status:string;last_success_at:string|null;error_code:string|null;pins_complete:number;coverage_from:string|null;coverage_to:string|null}|undefined
  const accountId = sync?.account_id
  const target = datesFor(period,now)
  const summary = accountId ? db.prepare("SELECT * FROM dashboard_pinterest_periods WHERE account_id=? AND period=?").get(accountId,period) as
    {coverage_from:string;coverage_to:string;impressions:number|null;saves:number|null;pin_clicks:number|null;
      outbound_clicks:number|null;engagements:number|null;fetched_at:string}|undefined : undefined
  const exact = summary?.coverage_from === target.from && summary.coverage_to === target.end
  const daily = accountId ? db.prepare(`SELECT day,impressions,saves,pin_clicks AS pinClicks,outbound_clicks AS outboundClicks,engagements
    FROM dashboard_pinterest_daily WHERE account_id=? AND day BETWEEN ? AND ? ORDER BY day`).all(accountId,target.from,target.end) as DailyRow[] : []
  const topSync = accountId ? db.prepare("SELECT * FROM dashboard_pinterest_top_sync WHERE account_id=? AND period=?").get(accountId,period) as
    {coverage_from:string;coverage_to:string;fetched_at:string}|undefined : undefined
  const topExact = topSync?.coverage_from === target.from && topSync.coverage_to === target.end
  const pins = topExact && accountId ? db.prepare(`SELECT t.pin_id AS id,p.title,p.image_url AS imageUrl,p.board_id AS boardId,
    p.destination_url AS destinationUrl,p.listing_id AS listingId,p.published_at AS publishedAt,
    t.impressions,t.saves,t.pin_clicks AS pinClicks,t.outbound_clicks AS outboundClicks,t.engagements
    FROM dashboard_pinterest_top_pins t LEFT JOIN dashboard_pinterest_pins p ON p.pin_id=t.pin_id
    WHERE t.account_id=? AND t.period=? ORDER BY t.impressions DESC LIMIT 50`).all(accountId,period) as TopRow[] : []
  const linked = topExact && accountId ? db.prepare(`SELECT p.listing_id AS listingId,COUNT(DISTINCT p.pin_id) AS pinCount,
    SUM(t.impressions) AS impressions,SUM(t.saves) AS saves,SUM(t.outbound_clicks) AS outboundClicks
    FROM dashboard_pinterest_pins p JOIN dashboard_pinterest_top_pins t ON t.pin_id=p.pin_id AND t.account_id=? AND t.period=?
    WHERE p.listing_id IS NOT NULL GROUP BY p.listing_id ORDER BY outboundClicks DESC LIMIT 25`).all(accountId,period) as LinkedRow[] : []
  return { connected,authorized,period,status:sync?.status ?? "not_synced",lastSuccessAt:sync?.last_success_at ?? null,
    errorCode:sync?.error_code ?? null,pinsComplete:Boolean(sync?.pins_complete),coverage: exact ? "current" : summary ? "stale" : "none",
    from:summary?.coverage_from ?? null,to:summary?.coverage_to ?? null,
    totals:exact ? {impressions:summary!.impressions,saves:summary!.saves,pinClicks:summary!.pin_clicks,
      outboundClicks:summary!.outbound_clicks,engagements:summary!.engagements,
      engagementRate:summary!.impressions && summary!.engagements !== null ? summary!.engagements/summary!.impressions : null} : null,
    daily:exact ? daily : [],pins,linked,topCoverage:topExact ? "top_50_recent_pins" : "not_current",
    topFetchedAt:topSync?.fetched_at ?? null }
}
