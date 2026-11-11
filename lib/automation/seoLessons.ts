import type Database from "better-sqlite3"
import { getAutomationDatabase } from "./db/database"

// Lecciones del SEO: Claude las propone (MCP propose_lesson) a partir de las
// revisiones; el propietario las activa en Automation y solo entonces se añaden
// al prompt del SEO de ese tipo de producto (o de todos si product_type es null).

export type SeoLessonStatus = "PROPOSED" | "ACTIVE" | "DISABLED" | "REJECTED"

export type SeoLesson = {
  id: number
  productType: string | null
  lesson: string
  reason: string | null
  sourceProductCode: string | null
  status: SeoLessonStatus
  createdAt: string
  updatedAt: string
}

type Row = {
  id: number
  product_type: string | null
  lesson: string
  reason: string | null
  source_product_code: string | null
  status: SeoLessonStatus
  created_at: string
  updated_at: string
}

const STATUSES = new Set<SeoLessonStatus>(["PROPOSED", "ACTIVE", "DISABLED", "REJECTED"])
/** Tope de lecciones activas que entran en el prompt (las más recientes). */
export const MAX_PROMPT_LESSONS = 30

function map(row: Row): SeoLesson {
  return {
    id: row.id,
    productType: row.product_type,
    lesson: row.lesson,
    reason: row.reason,
    sourceProductCode: row.source_product_code,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class SeoLessonStore {
  constructor(private readonly database: Database.Database = getAutomationDatabase()) {}

  propose(input: { lesson: string; reason?: string | null; productType?: string | null; sourceProductCode?: string | null }) {
    const lesson = String(input.lesson || "").replace(/\s+/g, " ").trim()
    if (lesson.length < 10 || lesson.length > 400) throw new Error("A lesson must be 10–400 characters.")
    const duplicate = this.database.prepare(
      "SELECT id FROM seo_lessons WHERE lower(lesson) = lower(?) AND status IN ('PROPOSED', 'ACTIVE')"
    ).get(lesson) as { id: number } | undefined
    if (duplicate) return this.get(duplicate.id)!
    const now = new Date().toISOString()
    const result = this.database.prepare(`
      INSERT INTO seo_lessons (product_type, lesson, reason, source_product_code, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'PROPOSED', ?, ?)
    `).run(input.productType || null, lesson, input.reason?.trim() || null, input.sourceProductCode || null, now, now)
    return this.get(Number(result.lastInsertRowid))!
  }

  get(id: number) {
    const row = this.database.prepare("SELECT * FROM seo_lessons WHERE id = ?").get(id) as Row | undefined
    return row ? map(row) : null
  }

  list() {
    return (this.database.prepare(`
      SELECT * FROM seo_lessons
      ORDER BY CASE status WHEN 'PROPOSED' THEN 0 WHEN 'ACTIVE' THEN 1 WHEN 'DISABLED' THEN 2 ELSE 3 END, id DESC
      LIMIT 300
    `).all() as Row[]).map(map)
  }

  setStatus(id: number, status: SeoLessonStatus) {
    if (!STATUSES.has(status)) throw new Error("Invalid lesson status.")
    const result = this.database.prepare("UPDATE seo_lessons SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, new Date().toISOString(), id)
    if (!result.changes) throw new Error("Lesson not found.")
    return this.get(id)!
  }

  /** Lecciones activas para un producto (las generales y las de ese producto). */
  activeFor(productType: string) {
    return (this.database.prepare(`
      SELECT * FROM seo_lessons
      WHERE status = 'ACTIVE' AND (product_type IS NULL OR product_type = ?)
      ORDER BY id DESC
      LIMIT ?
    `).all(productType, MAX_PROMPT_LESSONS) as Row[]).map((row) => row.lesson)
  }
}
