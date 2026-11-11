// Resumen de estado del sistema en una sola llamada (MCP get_status).
import { getAutomationDatabase } from "./db/database"
import { getEtsyApiUsage } from "../etsy/client"
import { SeoLessonStore } from "./seoLessons"

export function getProductionStatus() {
  const database = getAutomationDatabase()
  const byStatus = Object.fromEntries(
    (database.prepare("SELECT status, COUNT(*) AS count FROM automation_jobs GROUP BY status").all() as Array<{ status: string; count: number }>)
      .map((row) => [row.status, row.count])
  )
  const incidents = database.prepare(`
    SELECT product_code AS productCode, product_type AS productType, last_error AS error, updated_at AS since
    FROM automation_jobs WHERE status = 'NEEDS_ATTENTION' ORDER BY updated_at DESC LIMIT 20
  `).all()
  const draftsAvailable = Object.fromEntries(
    (database.prepare(`
      SELECT product_type, COUNT(*) AS count FROM etsy_draft_pool WHERE status = 'AVAILABLE' GROUP BY product_type
    `).all() as Array<{ product_type: string; count: number }>).map((row) => [row.product_type, row.count])
  )
  const waitingForDrafts = database.prepare(`
    SELECT j.product_code AS productCode, j.product_type AS productType FROM automation_jobs j
    WHERE j.status = 'LOCAL_COMPLETE' AND j.etsy_draft_id IS NULL
  `).all()
  const agent = database.prepare("SELECT name, last_seen_at AS lastSeenAt FROM automation_agents ORDER BY last_seen_at DESC LIMIT 1").get() ?? null
  const lessons = new SeoLessonStore(database).list()

  return {
    designsByStatus: byStatus,
    pendingApproval: byStatus.PENDING_APPROVAL ?? 0,
    waitingEtsyReview: byStatus.WAITING_ETSY_REVIEW ?? 0,
    incidents,
    draftsAvailable,
    waitingForDrafts,
    automaty: agent,
    etsyApiToday: getEtsyApiUsage(),
    lessons: {
      active: lessons.filter((lesson) => lesson.status === "ACTIVE").length,
      proposed: lessons.filter((lesson) => lesson.status === "PROPOSED").length,
    },
  }
}
