import type Database from "better-sqlite3"
import { getCatalogSnapshot } from "./etsy-catalog"
import { getSalesSnapshot } from "./etsy-sales"
import type { DashboardPeriod } from "./overview"

// Resumen del Dashboard de un vistazo (V1–V3, V5): cifras con su variación, ventas por día,
// embudo de producción, listings con cara y salud del sistema.
// Una cifra es null cuando el dato no es fiable (sincronización incompleta, varias monedas…).

export type Kpi = {
  current: number | null
  previous: number | null
  spark: number[]
}

export type DashboardHome = {
  period: DashboardPeriod
  asOf: string
  currency: string | null
  salesComplete: boolean
  kpis: { revenue: Kpi; orders: Kpi; averageOrder: Kpi; activeListings: Kpi; published: Kpi }
  daily: Array<{ date: string; revenue: number | null; orders: number }>
  funnel: { submitted: number; approved: number; produced: number; published: number; withSales: number }
  top: Array<{ listingId: number; title: string | null; units: number; revenue: number | null; jobId: string | null }>
  quiet: Array<{ listingId: number; title: string; ageDays: number | null; seasonal: boolean; jobId: string | null }>
  byProduct: Array<{ productType: string; units: number; revenue: number | null }>
  costs: {
    rate: number
    rows: Array<{
      listingId: string; productCode: string; title: string | null; jobId: string
      openaiUsd: number; etsyFeeUsd: number; r2Usd: number; totalUsd: number
      revenue: number | null; margin: number | null
    }>
  }
  lastBackupAt: string | null
  automatyLastSeenAt: string | null
  agentVersion: string | null
  credentialsRenewedAt: { etsy: string | null; pinterest: string | null }
  catalogSyncedAt: string | null
  salesSyncedAt: string | null
}

const SEASONAL = /\b(christmas|xmas|holiday|halloween|thanksgiving|easter|valentine|st\.? patrick|mother'?s day|father'?s day|new year|winter|autumn|fall|spring|summer|fourth of july|4th of july)\b/i

/** Tipo de producto por el título, para listings anteriores a Automation (V2). */
export function inferProductType(title: string | null) {
  const text = (title || "").toLowerCase()
  if (/frame tv|samsung frame|tv art/.test(text)) return "frame_tv_art"
  if (/nursery|baby|kids room/.test(text)) return "nursery_wall_art"
  if (/\bpng\b|sublimation|t-?shirt|shirt design/.test(text)) return "png_designs"
  if (/horizontal|landscape print|panoramic/.test(text)) return "horizontal_wall_art"
  if (/wall art|print|poster|printable/.test(text)) return "vertical_wall_art"
  return null
}

// Costes por listing (V4): tarifa de publicación de Etsy, OpenAI medido y R2 estimado.
const ETSY_LISTING_FEE_USD = 0.2
const R2_USD_PER_GB_MONTH = 0.015

export function isSeasonalTitle(title: string) {
  return SEASONAL.test(title)
}

function windowOf(period: DashboardPeriod, now: Date) {
  const days = Number.parseInt(period, 10)
  const from = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days + 1) / 1000)
  return { days, from, previousFrom: from - days * 86400, end: Math.floor(now.getTime() / 1000) + 1 }
}

const iso = (seconds: number) => new Date(seconds * 1000).toISOString()

export function getDashboardHome(
  db: Database.Database,
  period: DashboardPeriod,
  access: { etsyConnected: boolean; etsySalesAuthorized: boolean },
  now = new Date()
): DashboardHome {
  const w = windowOf(period, now)
  const sales = getSalesSnapshot(db, period, access.etsyConnected, access.etsySalesAuthorized, now)
  const catalog = getCatalogSnapshot(db, period, access.etsyConnected, now)

  // Una sola moneda: si hubiera varias, no se suman importes.
  const currencies = new Set([
    ...Object.keys(sales.current?.currencies || {}),
    ...Object.keys(sales.previous?.currencies || {}),
  ])
  const currency = currencies.size === 1 ? [...currencies][0] : null
  const moneyOk = Boolean(sales.complete && currency && sales.current?.financialComplete && sales.previous?.financialComplete)
  const revenueOf = (summary: typeof sales.current) =>
    moneyOk && summary ? summary.currencies[currency!]?.orderTotal ?? 0 : null

  const daily = sales.daily.map((day) => ({
    date: day.date,
    orders: day.paid,
    revenue: moneyOk ? day.currencies[currency!]?.orderTotal ?? 0 : null,
  }))

  const revenueNow = revenueOf(sales.current)
  const revenueBefore = revenueOf(sales.previous)
  const ordersNow = sales.current?.paid ?? null
  const ordersBefore = sales.previous?.paid ?? null

  // Publicados: diseños de Automation que llegaron a ETSY_ACTIVE en cada día del periodo.
  const publishedRows = db.prepare(`
    SELECT substr(created_at, 1, 10) AS day, COUNT(DISTINCT job_id) AS count
    FROM automation_job_events WHERE to_status = 'ETSY_ACTIVE' AND created_at >= ? AND created_at < ?
    GROUP BY day
  `).all(iso(w.previousFrom), iso(w.end)) as Array<{ day: string; count: number }>
  const publishedByDay = new Map(publishedRows.map((row) => [row.day, row.count]))
  const days = Array.from({ length: w.days }, (_, index) => iso(w.from + index * 86400).slice(0, 10))
  const previousDays = Array.from({ length: w.days }, (_, index) => iso(w.previousFrom + index * 86400).slice(0, 10))
  const sum = (list: string[]) => list.reduce((total, day) => total + (publishedByDay.get(day) || 0), 0)

  // Embudo: diseños creados en el periodo y hasta dónde llegaron.
  const funnelRow = db.prepare(`
    SELECT
      COUNT(*) AS submitted,
      SUM(EXISTS (SELECT 1 FROM automation_job_events e WHERE e.job_id = j.id AND e.to_status = 'QUEUED_LOCAL')) AS approved,
      SUM(EXISTS (SELECT 1 FROM automation_job_events e WHERE e.job_id = j.id AND e.to_status = 'LOCAL_COMPLETE')) AS produced,
      SUM(EXISTS (SELECT 1 FROM automation_job_events e WHERE e.job_id = j.id AND e.to_status = 'ETSY_ACTIVE')) AS published,
      SUM(j.etsy_draft_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM dashboard_etsy_transactions t JOIN dashboard_etsy_receipts r
          ON r.shop_id = t.shop_id AND r.receipt_id = t.receipt_id
        WHERE CAST(t.listing_id AS TEXT) = j.etsy_draft_id AND r.status IN ('paid', 'completed')
      )) AS withSales
    FROM automation_jobs j WHERE j.created_at >= ? AND j.created_at < ?
  `).get(iso(w.from), iso(w.end)) as Record<keyof DashboardHome["funnel"], number | null>

  const jobFor = db.prepare("SELECT id FROM automation_jobs WHERE etsy_draft_id = ? ORDER BY created_at DESC LIMIT 1")
  const jobIdOf = (listingId: number) => (jobFor.get(String(listingId)) as { id: string } | undefined)?.id ?? null
  const titleOf = db.prepare("SELECT title FROM dashboard_etsy_listings WHERE listing_id = ? LIMIT 1")

  const top = sales.productReady
    ? sales.products
        .filter((row): row is typeof row & { listingId: number } => row.listingId != null)
        .slice(0, 6)
        .map((row) => ({
          listingId: row.listingId,
          title: (titleOf.get(row.listingId) as { title: string } | undefined)?.title ?? null,
          units: row.units,
          revenue: currency && row.currency === currency ? row.lineTotal : null,
          jobId: jobIdOf(row.listingId),
        }))
    : []

  const shop = db.prepare(
    "SELECT shop_id FROM dashboard_etsy_sales_sync WHERE last_success_at IS NOT NULL ORDER BY last_success_at DESC LIMIT 1"
  ).get() as { shop_id: number } | undefined
  const quietRows = sales.complete && catalog.detailsComplete && shop
    ? db.prepare(`
        SELECT l.listing_id AS listingId, l.title, l.created_timestamp AS created
        FROM dashboard_etsy_listings l
        WHERE l.shop_id = ? AND l.state = 'active' AND NOT EXISTS (
          SELECT 1 FROM dashboard_etsy_transactions t JOIN dashboard_etsy_receipts r
            ON r.shop_id = t.shop_id AND r.receipt_id = t.receipt_id
          WHERE t.shop_id = l.shop_id AND t.listing_id = l.listing_id
            AND r.status IN ('paid', 'completed') AND r.created_timestamp >= ?
        )
        ORDER BY l.created_timestamp ASC LIMIT 8
      `).all(shop.shop_id, w.from) as Array<{ listingId: number; title: string; created: number | null }>
    : []
  const quiet = quietRows.map((row) => ({
    listingId: row.listingId,
    title: row.title,
    ageDays: row.created ? Math.floor((now.getTime() / 1000 - row.created) / 86400) : null,
    seasonal: isSeasonalTitle(row.title),
    jobId: jobIdOf(row.listingId),
  }))

  // Ventas por tipo de producto (V2).
  const productOf = db.prepare("SELECT product_type FROM automation_jobs WHERE etsy_draft_id = ? ORDER BY created_at DESC LIMIT 1")
  const byProductMap = new Map<string, { productType: string; units: number; revenue: number | null }>()
  if (sales.productReady && shop) {
    const rows = db.prepare(`
      SELECT t.listing_id AS listingId, t.currency_code AS currency, SUM(t.quantity) AS units,
        SUM(t.price_amount * t.quantity * 1.0 / t.price_divisor) AS lineTotal
      FROM dashboard_etsy_transactions t JOIN dashboard_etsy_receipts r ON r.shop_id = t.shop_id AND r.receipt_id = t.receipt_id
      WHERE t.shop_id = ? AND r.created_timestamp >= ? AND r.created_timestamp < ? AND r.status IN ('paid', 'completed')
      GROUP BY t.listing_id, t.currency_code
    `).all(shop.shop_id, w.from, w.end) as Array<{ listingId: number | null; currency: string | null; units: number; lineTotal: number | null }>
    for (const row of rows) {
      const fromJob = row.listingId != null ? (productOf.get(String(row.listingId)) as { product_type: string } | undefined)?.product_type : undefined
      const title = row.listingId != null ? (titleOf.get(row.listingId) as { title: string } | undefined)?.title ?? null : null
      const key = fromJob ?? inferProductType(title) ?? "other"
      const entry = byProductMap.get(key) ?? { productType: key, units: 0, revenue: currency ? 0 : null }
      entry.units += row.units
      if (entry.revenue != null) entry.revenue = currency && row.currency === currency && row.lineTotal != null ? entry.revenue + row.lineTotal : null
      byProductMap.set(key, entry)
    }
  }

  // Coste y margen de los listings publicados por Automation (últimos 50).
  const rate = Number(process.env.COST_USD_TO_SHOP_RATE || (currency === "USD" ? 1 : 0.86))
  const costRows = db.prepare(`
    SELECT j.id AS jobId, j.product_code AS productCode, j.etsy_draft_id AS listingId, j.created_at AS createdAt,
      (SELECT COALESCE(SUM(f.byte_size), 0) FROM automation_job_files f WHERE f.job_id = j.id AND f.status != 'DELETED') AS bytes,
      (SELECT GROUP_CONCAT(e.metadata_json, '\u001f') FROM automation_job_events e WHERE e.job_id = j.id AND e.event_type = 'OPENAI_USAGE') AS usage,
      (SELECT SUM(t.price_amount * t.quantity * 1.0 / t.price_divisor) FROM dashboard_etsy_transactions t
        JOIN dashboard_etsy_receipts r ON r.shop_id = t.shop_id AND r.receipt_id = t.receipt_id
        WHERE CAST(t.listing_id AS TEXT) = j.etsy_draft_id AND r.status IN ('paid', 'completed')
          AND (? IS NULL OR t.currency_code = ?)) AS revenue
    FROM automation_jobs j
    WHERE j.etsy_draft_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM automation_job_events e WHERE e.job_id = j.id AND e.to_status = 'ETSY_ACTIVE')
    ORDER BY j.created_at DESC LIMIT 50
  `).all(currency, currency) as Array<{ jobId: string; productCode: string; listingId: string; createdAt: string; bytes: number; usage: string | null; revenue: number | null }>
  const costs = costRows.map((row) => {
    let openaiUsd = 0
    for (const chunk of (row.usage || "").split("\u001f").filter(Boolean)) {
      try {
        openaiUsd += Number((JSON.parse(chunk) as { costUsd?: number }).costUsd || 0)
      } catch {
        // evento dañado: no suma
      }
    }
    const months = Math.max(1, (now.getTime() - Date.parse(row.createdAt)) / (30 * 86_400_000))
    const r2Usd = (row.bytes / 1e9) * R2_USD_PER_GB_MONTH * months
    const totalUsd = openaiUsd + ETSY_LISTING_FEE_USD + r2Usd
    const revenue = currency ? row.revenue ?? 0 : null
    return {
      listingId: row.listingId,
      productCode: row.productCode,
      title: (titleOf.get(Number(row.listingId)) as { title: string } | undefined)?.title ?? null,
      jobId: row.jobId,
      openaiUsd,
      etsyFeeUsd: ETSY_LISTING_FEE_USD,
      r2Usd,
      totalUsd,
      revenue,
      margin: revenue == null ? null : revenue - totalUsd * rate,
    }
  })

  const setting = (key: string) =>
    (db.prepare("SELECT setting_value FROM automation_settings WHERE setting_key = ?").get(key) as { setting_value: string } | undefined)
      ?.setting_value ?? null
  const agent = db.prepare("SELECT last_seen_at AS lastSeen, capabilities_json AS capabilities FROM automation_agents ORDER BY last_seen_at DESC LIMIT 1")
    .get() as { lastSeen: string | null; capabilities: string | null } | undefined
  let agentVersion: string | null = null
  try {
    agentVersion = agent?.capabilities ? String((JSON.parse(agent.capabilities) as { version?: unknown }).version ?? "") || null : null
  } catch {
    agentVersion = null
  }
  const renewedAt = (provider: string) =>
    (db.prepare("SELECT updated_at FROM integration_credentials WHERE provider = ?").get(provider) as { updated_at: string } | undefined)?.updated_at ?? null

  return {
    period,
    asOf: now.toISOString(),
    currency: moneyOk ? currency : null,
    salesComplete: sales.complete,
    kpis: {
      revenue: { current: revenueNow, previous: revenueBefore, spark: daily.map((day) => day.revenue ?? 0) },
      orders: { current: ordersNow, previous: ordersBefore, spark: daily.map((day) => day.orders) },
      averageOrder: {
        current: revenueNow != null && ordersNow ? revenueNow / ordersNow : null,
        previous: revenueBefore != null && ordersBefore ? revenueBefore / ordersBefore : null,
        spark: [],
      },
      activeListings: { current: catalog.counts?.active ?? null, previous: null, spark: [] },
      published: {
        current: sum(days),
        previous: sum(previousDays),
        spark: days.map((day) => publishedByDay.get(day) || 0),
      },
    },
    daily,
    funnel: {
      submitted: funnelRow.submitted || 0,
      approved: funnelRow.approved || 0,
      produced: funnelRow.produced || 0,
      published: funnelRow.published || 0,
      withSales: funnelRow.withSales || 0,
    },
    top,
    quiet,
    byProduct: [...byProductMap.values()].sort((a, b) => b.units - a.units),
    costs: { rate, rows: costs },
    lastBackupAt: setting("backup.last_at"),
    automatyLastSeenAt: agent?.lastSeen ?? null,
    agentVersion,
    credentialsRenewedAt: { etsy: renewedAt("etsy"), pinterest: renewedAt("pinterest") },
    catalogSyncedAt: catalog.lastSuccessAt ?? null,
    salesSyncedAt: sales.lastSuccessAt,
  }
}
