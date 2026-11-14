import type Database from "better-sqlite3"
import { getAutomationDatabase } from "./db/database"

// Revisión diaria de drafts por Claude (tarea programada): cada tanda deja un informe con lo
// que cambió en cada listing, los errores que encontró y los patrones que se repiten. Ese
// informe es la base para mejorar el SEO día a día con el propietario.

export type ReviewedListing = {
  productCode: string
  changes: string[]
  issues: string[]
}

export type ReviewReportInput = {
  summary: string
  listings: ReviewedListing[]
  patterns: string[]
}

export type ReviewReport = ReviewReportInput & { id: number; createdAt: string }

function strings(value: unknown, max: number, maxLength = 600) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item ?? "").trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, max)
}

export function parseReviewReport(input: Record<string, unknown>): ReviewReportInput {
  const summary = String(input.summary ?? "").trim()
  if (summary.length < 10) throw new Error('"summary" is required (what was reviewed and found).')
  const listings = (Array.isArray(input.listings) ? input.listings : []).slice(0, 100).map((raw) => {
    const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
    const productCode = String(item.productCode ?? "").trim()
    if (!/^LBCreaStudio-[A-Z0-9]{6}$/.test(productCode)) throw new Error(`Invalid productCode "${productCode}".`)
    return { productCode, changes: strings(item.changes, 30), issues: strings(item.issues, 30) }
  })
  return { summary: summary.slice(0, 4000), listings, patterns: strings(input.patterns, 30) }
}

export class ReviewReportStore {
  constructor(private readonly database: Database.Database = getAutomationDatabase()) {}

  save(report: ReviewReportInput) {
    const now = new Date().toISOString()
    const save = this.database.transaction(() => {
      const result = this.database
        .prepare("INSERT INTO review_reports (summary, report_json, created_at) VALUES (?, ?, ?)")
        .run(report.summary, JSON.stringify({ listings: report.listings, patterns: report.patterns }), now)
      // Cada listing queda marcado como revisado (para no repetirlo en la tanda siguiente).
      const event = this.database.prepare(`
        INSERT INTO automation_job_events (job_id, event_type, message, metadata_json, created_at)
        SELECT id, 'SCHEDULED_REVIEW', ?, ?, ? FROM automation_jobs WHERE product_code = ?
      `)
      for (const listing of report.listings) {
        const message = listing.changes.length
          ? `Revisión diaria: ${listing.changes.length} cambio(s).`
          : "Revisión diaria: sin cambios."
        event.run(message, JSON.stringify(listing), now, listing.productCode)
      }
      return Number(result.lastInsertRowid)
    })
    return this.get(save())!
  }

  get(id: number): ReviewReport | null {
    const row = this.database.prepare("SELECT * FROM review_reports WHERE id = ?").get(id) as
      | { id: number; summary: string; report_json: string; created_at: string }
      | undefined
    if (!row) return null
    const body = JSON.parse(row.report_json) as { listings: ReviewedListing[]; patterns: string[] }
    return { id: row.id, summary: row.summary, listings: body.listings, patterns: body.patterns, createdAt: row.created_at }
  }

  list(limit = 7) {
    const rows = this.database.prepare("SELECT id FROM review_reports ORDER BY id DESC LIMIT ?")
      .all(Math.max(1, Math.min(60, Math.trunc(limit)))) as Array<{ id: number }>
    return rows.map((row) => this.get(row.id)!)
  }

  /** Último momento en que la revisión diaria revisó cada listing (por código). */
  lastReviewedAt(productCodes: string[]) {
    if (!productCodes.length) return new Map<string, string>()
    const rows = this.database.prepare(`
      SELECT j.product_code AS code, MAX(e.created_at) AS at
      FROM automation_job_events e JOIN automation_jobs j ON j.id = e.job_id
      WHERE e.event_type = 'SCHEDULED_REVIEW' AND j.product_code IN (SELECT value FROM json_each(?))
      GROUP BY j.product_code
    `).all(JSON.stringify(productCodes)) as Array<{ code: string; at: string }>
    return new Map(rows.map((row) => [row.code, row.at]))
  }
}
