import type Database from "better-sqlite3"
import { getAutomationDatabase } from "./db/database"
import { getSalesSnapshot } from "../dashboard/etsy-sales"
import type { DashboardPeriod } from "../dashboard/overview"

// Contexto para Claude por MCP: aprendizaje (M3) y ventas reales de la tienda (M4).

/** Rechazos con nota, correcciones de Claude y resultados de la revisión diaria, en compacto. */
export function listFeedback(
  options: { sinceDays?: number; limit?: number } = {},
  database: Database.Database = getAutomationDatabase()
) {
  const sinceDays = Math.max(1, Math.min(365, Math.trunc(options.sinceDays ?? 30)))
  const limit = Math.max(1, Math.min(200, Math.trunc(options.limit ?? 50)))
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString()

  const rejections = (database.prepare(`
    SELECT product_code AS productCode, product_type AS productType, review_note AS note, reviewed_at AS at
    FROM automation_jobs
    WHERE origin = 'claude' AND status = 'CANCELED' AND review_note IS NOT NULL AND reviewed_at >= ?
    ORDER BY reviewed_at DESC LIMIT ?
  `).all(since, limit)) as Array<{ productCode: string; productType: string; note: string; at: string }>

  const editRows = database.prepare(`
    SELECT j.product_code AS productCode, j.product_type AS productType, e.metadata_json AS metadata, e.created_at AS at
    FROM automation_job_events e JOIN automation_jobs j ON j.id = e.job_id
    WHERE e.event_type = 'CLAUDE_EDIT' AND e.created_at >= ?
    ORDER BY e.created_at DESC LIMIT ?
  `).all(since, limit) as Array<{ productCode: string; productType: string; metadata: string | null; at: string }>
  const edits = editRows.map((row) => {
    let reason: string | null = null
    let fields: string[] = []
    try {
      const metadata = row.metadata ? JSON.parse(row.metadata) as { reason?: string; changes?: Record<string, unknown> } : {}
      reason = metadata.reason ?? null
      fields = Object.keys(metadata.changes || {})
    } catch {
      // metadato dañado: se devuelve sin detalle
    }
    return { productCode: row.productCode, productType: row.productType, fields, reason, at: row.at }
  })

  const scheduledReviews = database.prepare(`
    SELECT j.product_code AS productCode, j.product_type AS productType, e.message, e.created_at AS at
    FROM automation_job_events e JOIN automation_jobs j ON j.id = e.job_id
    WHERE e.event_type = 'SCHEDULED_REVIEW' AND e.created_at >= ?
    ORDER BY e.created_at DESC LIMIT ?
  `).all(since, limit) as Array<{ productCode: string; productType: string; message: string; at: string }>

  return { sinceDays, rejections, edits, scheduledReviews }
}

/** Ventas por listing y por producto con los datos ya sincronizados del Dashboard (sin créditos de Alura). */
export function getSalesByListing(
  options: { period?: DashboardPeriod; limit?: number } = {},
  database: Database.Database = getAutomationDatabase()
) {
  const period = options.period ?? "30d"
  const limit = Math.max(1, Math.min(200, Math.trunc(options.limit ?? 50)))
  const sales = getSalesSnapshot(database, period, true, true)
  if (!sales.complete || !sales.productReady) {
    return { period, available: false, reason: "Etsy orders are not fully synced for this period (Dashboard → Ventas).", listings: [], byProduct: [] }
  }
  const title = database.prepare("SELECT title FROM dashboard_etsy_listings WHERE listing_id = ? LIMIT 1")
  const job = database.prepare("SELECT product_code, product_type FROM automation_jobs WHERE etsy_draft_id = ? ORDER BY created_at DESC LIMIT 1")
  const listings = sales.products
    .filter((row) => row.listingId != null)
    .map((row) => {
      const automation = job.get(String(row.listingId)) as { product_code: string; product_type: string } | undefined
      return {
        listingId: row.listingId,
        title: (title.get(row.listingId) as { title: string } | undefined)?.title ?? null,
        productCode: automation?.product_code ?? null,
        productType: automation?.product_type ?? null,
        units: row.units,
        revenue: row.lineTotal,
        currency: row.currency,
      }
    })
  const byProduct = new Map<string, { productType: string; units: number; revenue: number; listings: number }>()
  for (const item of listings) {
    const key = item.productType ?? "pre_automation"
    const entry = byProduct.get(key) ?? { productType: key, units: 0, revenue: 0, listings: 0 }
    entry.units += item.units
    entry.revenue += item.revenue ?? 0
    entry.listings += 1
    byProduct.set(key, entry)
  }
  return {
    period,
    available: true,
    listings: listings.slice(0, limit),
    byProduct: [...byProduct.values()].sort((a, b) => b.units - a.units),
  }
}
