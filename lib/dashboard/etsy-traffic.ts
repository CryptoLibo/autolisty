import type Database from "better-sqlite3"
import type { DashboardPeriod } from "./overview"

export type TrafficInput = {
  visits: number; listingViews?: number | null; etsySearchVisits?: number | null;
  etsyAdsVisits?: number | null; socialVisits?: number | null; pinterestVisits?: number | null
}
export class TrafficInputError extends Error {}
function dates(period: DashboardPeriod, now: Date) {
  const to = now.toISOString().slice(0,10)
  const from = new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-Number.parseInt(period,10)+1)).toISOString().slice(0,10)
  return {from,to}
}
function count(value: unknown, required = false): number | null {
  if (value == null && !required) return null
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new TrafficInputError("Los valores deben ser números enteros no negativos.")
  return value
}
export function saveTrafficObservation(db: Database.Database, period: DashboardPeriod, input: TrafficInput, now = new Date()) {
  const values = {
    visits:count(input.visits,true)!, listingViews:count(input.listingViews), etsySearchVisits:count(input.etsySearchVisits),
    etsyAdsVisits:count(input.etsyAdsVisits), socialVisits:count(input.socialVisits), pinterestVisits:count(input.pinterestVisits),
  }
  if ([values.etsySearchVisits,values.etsyAdsVisits,values.socialVisits,values.pinterestVisits].some(value=>value != null && value > values.visits) ||
    (values.socialVisits != null && values.pinterestVisits != null && values.pinterestVisits > values.socialVisits))
    throw new TrafficInputError("Una fuente no puede superar las visitas de la tienda; Pinterest no puede superar el total social.")
  const {from,to}=dates(period,now)
  db.prepare(`INSERT INTO dashboard_etsy_traffic_observations
    (period,from_day,to_day,visits,listing_views,etsy_search_visits,etsy_ads_visits,social_visits,pinterest_visits,source,captured_at)
    VALUES (?,?,?,?,?,?,?,?,?,'etsy_shop_stats_manual',?)
    ON CONFLICT(period,from_day,to_day) DO UPDATE SET visits=excluded.visits,listing_views=excluded.listing_views,
      etsy_search_visits=excluded.etsy_search_visits,etsy_ads_visits=excluded.etsy_ads_visits,
      social_visits=excluded.social_visits,pinterest_visits=excluded.pinterest_visits,captured_at=excluded.captured_at`)
    .run(period,from,to,values.visits,values.listingViews,values.etsySearchVisits,values.etsyAdsVisits,values.socialVisits,values.pinterestVisits,now.toISOString())
  return trafficSnapshot(db,period,now)
}
export function trafficSnapshot(db: Database.Database, period: DashboardPeriod, now = new Date()) {
  const {from,to}=dates(period,now)
  const row=db.prepare(`SELECT visits,listing_views AS listingViews,etsy_search_visits AS etsySearchVisits,
    etsy_ads_visits AS etsyAdsVisits,social_visits AS socialVisits,pinterest_visits AS pinterestVisits,
    source,captured_at AS capturedAt FROM dashboard_etsy_traffic_observations
    WHERE period=? AND from_day=? AND to_day=?`).get(period,from,to) as (TrafficInput & {source:string;capturedAt:string})|undefined
  return {period,from,to,observation:row ?? null,coverage:row?"owner_recorded":"none"}
}
