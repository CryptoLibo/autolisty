import crypto from "node:crypto"
import type Database from "better-sqlite3"
import { generateProductCode, isProductCode } from "../utils/generateListingId"
import { getAutomationDatabase } from "./db/database"
import { assertAutomationTransition, isTerminalAutomationStatus } from "./stateMachine"
import type {
  AutomationJob,
  AutomationJobEvent,
  AutomationJobFile,
  AutomationJobOrigin,
  AutomationJobStatus,
  AutomationAgent,
  AutomationAgentStatus,
  AutomationPipelineMode,
  CreateAutomationJobInput,
  EtsyDraftPoolItem,
} from "./types"

type AutomationJobRow = {
  id: string
  product_code: string
  product_type: AutomationJob["productType"]
  source_prompt: string
  status: AutomationJobStatus
  resume_status: AutomationJobStatus | null
  local_agent_id: string | null
  lease_expires_at: string | null
  etsy_draft_id: string | null
  etsy_state: string | null
  etsy_url: string | null
  seo_json: string | null
  pinterest_seo_json: string | null
  last_error: string | null
  next_attempt_at: string | null
  retry_count: number
  created_at: string
  updated_at: string
  completed_at: string | null
  origin: AutomationJobOrigin | null
  brief_json: string | null
  review_note: string | null
  reviewed_at: string | null
  priority: number | null
  local_cleaned_at: string | null
  delivery_url: string | null
  delivery_filename: string | null
  claude_edit_until: string | null
}

type AutomationEventRow = {
  id: number
  job_id: string
  event_type: string
  from_status: AutomationJobStatus | null
  to_status: AutomationJobStatus | null
  message: string | null
  metadata_json: string | null
  created_at: string
}

type AutomationFileRow = {
  id: string
  job_id: string
  slot_key: string
  role: string
  position: number | null
  relative_path: string
  r2_key: string | null
  content_type: string | null
  byte_size: number | null
  sha256: string | null
  status: AutomationJobFile["status"]
  uploaded_at: string | null
  verified_at: string | null
  deleted_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

type EtsyDraftPoolRow = {
  draft_id: string
  product_type: EtsyDraftPoolItem["productType"]
  taxonomy_id: number | null
  status: EtsyDraftPoolItem["status"]
  assigned_job_id: string | null
  assigned_at: string | null
  created_at: string
  updated_at: string
}

type AutomationAgentRow = {
  id: string
  name: string
  status: AutomationAgentStatus
  capabilities_json: string | null
  current_job_id: string | null
  last_seen_at: string | null
  created_at: string
  updated_at: string
}

const PIPELINE_MODE_SETTING = "production_pipeline_mode"
// Solo la producción en Automaty ocupa la máquina. Los pasos de servidor
// (draft, SEO, Etsy, Pinterest) corren en paralelo y no bloquean la cola local.
export const LOCAL_PRODUCTION_STATUSES: AutomationJobStatus[] = [
  "LOCAL_CLAIMED",
  "LOCAL_BUILDING",
  "LOCAL_VALIDATING",
  "LOCAL_UPLOADING",
]
const PRODUCTION_BLOCKING_STATUSES: AutomationJobStatus[] = LOCAL_PRODUCTION_STATUSES

// LOCAL_CLAIMED = sincronizado a la cola local de Automaty, aún sin empezar.
const LOCAL_IN_PROGRESS_STATUSES: AutomationJobStatus[] = ["LOCAL_BUILDING", "LOCAL_VALIDATING", "LOCAL_UPLOADING"]

function mapJob(row: AutomationJobRow): AutomationJob {
  return {
    id: row.id,
    productCode: row.product_code,
    productType: row.product_type,
    sourcePrompt: row.source_prompt,
    status: row.status,
    resumeStatus: row.resume_status,
    localAgentId: row.local_agent_id,
    leaseExpiresAt: row.lease_expires_at,
    etsyDraftId: row.etsy_draft_id,
    etsyState: row.etsy_state,
    etsyUrl: row.etsy_url,
    seoJson: row.seo_json,
    pinterestSeoJson: row.pinterest_seo_json,
    lastError: row.last_error,
    nextAttemptAt: row.next_attempt_at,
    retryCount: row.retry_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    origin: row.origin || "owner",
    briefJson: row.brief_json,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
    priority: row.priority ?? 0,
    localCleanedAt: row.local_cleaned_at,
    deliveryUrl: row.delivery_url ?? null,
    deliveryFilename: row.delivery_filename ?? null,
    claudeEditUntil: row.claude_edit_until ?? null,
  }
}

function mapEvent(row: AutomationEventRow): AutomationJobEvent {
  return {
    id: row.id,
    jobId: row.job_id,
    eventType: row.event_type,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    message: row.message,
    metadataJson: row.metadata_json,
    createdAt: row.created_at,
  }
}

function mapFile(row: AutomationFileRow): AutomationJobFile {
  return {
    id: row.id,
    jobId: row.job_id,
    slotKey: row.slot_key,
    role: row.role,
    position: row.position,
    relativePath: row.relative_path,
    r2Key: row.r2_key,
    contentType: row.content_type,
    byteSize: row.byte_size,
    sha256: row.sha256,
    status: row.status,
    uploadedAt: row.uploaded_at,
    verifiedAt: row.verified_at,
    deletedAt: row.deleted_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapDraft(row: EtsyDraftPoolRow): EtsyDraftPoolItem {
  return {
    draftId: row.draft_id,
    productType: row.product_type,
    taxonomyId: row.taxonomy_id,
    status: row.status,
    assignedJobId: row.assigned_job_id,
    assignedAt: row.assigned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapAgent(row: AutomationAgentRow): AutomationAgent {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    capabilitiesJson: row.capabilities_json,
    currentJobId: row.current_job_id,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Prefijo (tras draft_template.) de los drafts ignorados que no pertenecen a ningún producto. */
const IGNORED_DRAFT_PREFIX = "ignored."

export class AutomationRepository {
  constructor(private readonly database: Database.Database = getAutomationDatabase()) {}

  createJob(input: CreateAutomationJobInput) {
    const now = new Date().toISOString()
    const jobId = crypto.randomUUID()
    const sourcePrompt = input.sourcePrompt.trim()

    if (!sourcePrompt) throw new Error("Automation jobs require a source prompt.")
    if (input.productCode !== undefined && !isProductCode(input.productCode)) throw new Error("Invalid product code.")
    const insert = this.database.prepare(`
      INSERT INTO automation_jobs (
        id, product_code, product_type, source_prompt, status, origin, brief_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'CREATED', ?, ?, ?, ?)
    `)

    const insertEvent = this.database.prepare(`
      INSERT INTO automation_job_events (
        job_id, event_type, to_status, message, created_at
      ) VALUES (?, 'JOB_CREATED', 'CREATED', ?, ?)
    `)

    const create = this.database.transaction(() => {
      for (let attempt = 0; attempt < (input.productCode ? 1 : 10); attempt += 1) {
        const productCode = input.productCode || generateProductCode()
        try {
          insert.run(jobId, productCode, input.productType, sourcePrompt, input.origin || "owner", input.briefJson ?? null, now, now)
          insertEvent.run(jobId, `Automation job ${productCode} created.`, now)
          return productCode
        } catch (error) {
          if (String(error).includes("automation_jobs.product_code")) {
            if (input.productCode) throw new Error("Product code is already assigned to an Automation job.")
            continue
          }
          throw error
        }
      }

      throw new Error("Unable to allocate a unique product code.")
    })

    const code = create()
    return this.getJob(jobId) || this.findJobByCode(code)!
  }

  findJobByCode(productCode: string) {
    const row = this.database.prepare("SELECT * FROM automation_jobs WHERE product_code=?").get(productCode) as AutomationJobRow | undefined
    return row ? mapJob(row) : null
  }

  /** Trabajo activo (no cancelado) que ya tiene una fuente con este hash. */
  findActiveJobBySourceHash(sha256: string, excludeJobId: string | null = null) {
    const row = this.database.prepare(`
      SELECT j.id FROM automation_jobs j
      JOIN automation_job_files f ON f.job_id = j.id
      WHERE f.sha256 = ? AND j.status != 'CANCELED' AND (? IS NULL OR j.id != ?)
      ORDER BY j.created_at DESC
      LIMIT 1
    `).get(sha256, excludeJobId, excludeJobId) as { id: string } | undefined
    return row ? this.getJob(row.id) : null
  }

  getJob(jobId: string) {
    const row = this.database
      .prepare("SELECT * FROM automation_jobs WHERE id = ?")
      .get(jobId) as AutomationJobRow | undefined
    return row ? mapJob(row) : null
  }

  listJobs(limit = 100) {
    const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)))
    const rows = this.database
      .prepare("SELECT * FROM automation_jobs ORDER BY created_at DESC LIMIT ?")
      .all(safeLimit) as AutomationJobRow[]
    return rows.map(mapJob)
  }

  listJobsByOrigin(origin: AutomationJobOrigin, options: { status?: AutomationJobStatus; limit?: number } = {}) {
    const safeLimit = Math.max(1, Math.min(500, Math.trunc(options.limit ?? 100)))
    const rows = options.status
      ? this.database
          .prepare("SELECT * FROM automation_jobs WHERE origin = ? AND status = ? ORDER BY created_at DESC LIMIT ?")
          .all(origin, options.status, safeLimit)
      : this.database
          .prepare("SELECT * FROM automation_jobs WHERE origin = ? ORDER BY created_at DESC LIMIT ?")
          .all(origin, safeLimit)
    return (rows as AutomationJobRow[]).map(mapJob)
  }

  // Aprobación del propietario para diseños en PENDING_APPROVAL.
  // approve -> QUEUED_LOCAL; reject -> CANCELED. La nota queda guardada para que
  // Claude aprenda de los rechazos.
  reviewJob(jobId: string, decision: "approve" | "reject", note: string | null = null) {
    const cleanNote = note?.trim().slice(0, 1000) || null
    const review = this.database.transaction(() => {
      const current = this.getJob(jobId)
      if (!current) throw new Error(`Automation job not found: ${jobId}`)
      if (current.status !== "PENDING_APPROVAL") {
        throw new Error("This design is not waiting for approval.")
      }
      const updated = this.transitionJob(jobId, decision === "approve" ? "QUEUED_LOCAL" : "CANCELED", {
        message: decision === "approve"
          ? "Design approved by the owner and queued for local production."
          : `Design rejected by the owner${cleanNote ? `: ${cleanNote}` : "."}`,
      })
      const now = new Date().toISOString()
      this.database
        .prepare("UPDATE automation_jobs SET review_note = ?, reviewed_at = ?, updated_at = ? WHERE id = ?")
        .run(cleanNote, now, now, jobId)
      return { ...updated, reviewNote: cleanNote, reviewedAt: now, updatedAt: now }
    })
    return review()
  }

  listAgents() {
    const rows = this.database
      .prepare("SELECT * FROM automation_agents ORDER BY last_seen_at DESC")
      .all() as AutomationAgentRow[]
    return rows.map(mapAgent)
  }

  // Sincronización con la cola local de Automaty. En una sola transacción:
  // 1) registra las carpetas locales que el agente ya borró,
  // 2) si la producción está activa, pasa todos los aprobados (QUEUED_LOCAL) a su cola,
  // 3) devuelve su cola (en curso primero, luego prioridad y antigüedad) y
  //    los listings terminados o cancelados cuya carpeta local debe borrar.
  syncAgentQueue(agentId: string, options: { cleanedJobIds?: string[] } = {}) {
    const sync = this.database.transaction(() => {
      const now = new Date().toISOString()
      const cleaned = [...new Set(options.cleanedJobIds || [])].slice(0, 500)
      const markCleaned = this.database.prepare(`
        UPDATE automation_jobs SET local_cleaned_at = ?, updated_at = ?
        WHERE id = ? AND local_agent_id = ? AND local_cleaned_at IS NULL AND status IN ('COMPLETED', 'CANCELED')
      `)
      for (const jobId of cleaned) markCleaned.run(now, now, jobId, agentId)

      const pipelineMode = this.getPipelineMode()
      const assignedNow: string[] = []
      if (pipelineMode === "RUNNING") {
        const queued = this.database.prepare(`
          SELECT id FROM automation_jobs WHERE status = 'QUEUED_LOCAL'
          ORDER BY priority DESC, created_at ASC LIMIT 200
        `).all() as Array<{ id: string }>
        const assign = this.database.prepare(`
          UPDATE automation_jobs SET status = 'LOCAL_CLAIMED', local_agent_id = ?, updated_at = ?
          WHERE id = ? AND status = 'QUEUED_LOCAL'
        `)
        const event = this.database.prepare(`
          INSERT INTO automation_job_events (job_id, event_type, from_status, to_status, message, created_at)
          VALUES (?, 'JOB_SYNCED', 'QUEUED_LOCAL', 'LOCAL_CLAIMED', ?, ?)
        `)
        for (const row of queued) {
          if (assign.run(agentId, now, row.id).changes === 1) {
            event.run(row.id, `Synced to the local queue of ${agentId}.`, now)
            assignedNow.push(row.id)
          }
        }
      }

      const localStatuses = LOCAL_PRODUCTION_STATUSES.map((status) => `'${status}'`).join(", ")
      const inProgress = LOCAL_IN_PROGRESS_STATUSES.map((status) => `'${status}'`).join(", ")
      const queue = (this.database.prepare(`
        SELECT * FROM automation_jobs
        WHERE local_agent_id = ? AND status IN (${localStatuses})
        ORDER BY CASE WHEN status IN (${inProgress}) THEN 0 ELSE 1 END, priority DESC, created_at ASC
      `).all(agentId) as AutomationJobRow[]).map(mapJob)

      const cleanup = (this.database.prepare(`
        SELECT * FROM automation_jobs
        WHERE local_agent_id = ? AND local_cleaned_at IS NULL AND status IN ('COMPLETED', 'CANCELED')
        ORDER BY updated_at ASC LIMIT 100
      `).all(agentId) as AutomationJobRow[]).map(mapJob)

      return { pipelineMode, queue, cleanup, assignedNow }
    })
    return sync()
  }

  // Prioridad en la cola (mayor = antes). Solo para trabajos que aún no empezaron.
  setJobPriority(jobId: string, priority: number) {
    const value = Math.max(-100, Math.min(100, Math.trunc(priority)))
    const result = this.database.prepare(`
      UPDATE automation_jobs SET priority = ?, updated_at = ?
      WHERE id = ? AND status IN ('PENDING_APPROVAL', 'QUEUED_LOCAL', 'LOCAL_CLAIMED')
    `).run(value, new Date().toISOString(), jobId)
    if (result.changes !== 1) throw new Error("Only designs that have not started production can be reprioritized.")
    return this.getJob(jobId)!
  }

  // Cancelación por el propietario de un diseño que aún no empezó en Automaty.
  // Si ya estaba en la cola local, Automaty lo retira en la siguiente sincronización.
  cancelQueuedJob(jobId: string, reason: string | null = null) {
    const current = this.getJob(jobId)
    if (!current) throw new Error(`Automation job not found: ${jobId}`)
    if (!["PENDING_APPROVAL", "QUEUED_LOCAL", "LOCAL_CLAIMED", "NEEDS_ATTENTION", "RETRY_WAIT"].includes(current.status)) {
      throw new Error("Only designs that have not started production, or that failed, can be canceled.")
    }
    const canceled = this.transitionJob(jobId, "CANCELED", {
      message: `Canceled by the owner${reason?.trim() ? `: ${reason.trim().slice(0, 300)}` : "."}`,
    })
    // Si tenía un draft de Etsy sin publicar, vuelve al pool (el siguiente uso lo reescribe entero).
    if (current.etsyDraftId && current.etsyState !== "active") {
      const now = new Date().toISOString()
      this.database.prepare(`
        UPDATE etsy_draft_pool
        SET status = 'AVAILABLE', assigned_job_id = NULL, assigned_at = NULL, updated_at = ?
        WHERE draft_id = ? AND assigned_job_id = ?
      `).run(now, current.etsyDraftId, jobId)
    }
    return canceled
  }

  listJobEvents(jobId: string) {
    const rows = this.database
      .prepare("SELECT * FROM automation_job_events WHERE job_id = ? ORDER BY id ASC")
      .all(jobId) as AutomationEventRow[]
    return rows.map(mapEvent)
  }

  listJobFiles(jobId: string) {
    const rows = this.database
      .prepare("SELECT * FROM automation_job_files WHERE job_id = ? ORDER BY position, created_at")
      .all(jobId) as AutomationFileRow[]
    return rows.map(mapFile)
  }

  /** Draft plantilla de cada producto (el que se duplica en Etsy; nunca entra en el pool). */
  getDraftTemplates(): Record<string, string> {
    const rows = this.database.prepare(
      "SELECT setting_key, setting_value FROM automation_settings WHERE setting_key LIKE 'draft_template.%'"
    ).all() as Array<{ setting_key: string; setting_value: string }>
    return Object.fromEntries(
      rows
        .map((row) => [row.setting_key.slice("draft_template.".length), row.setting_value] as const)
        .filter(([key]) => !key.startsWith(IGNORED_DRAFT_PREFIX))
    )
  }

  /** Drafts que no son de ningún producto actual (p. ej. la plantilla antigua de phone cases): se ignoran siempre. */
  getIgnoredDrafts(): string[] {
    const rows = this.database.prepare(
      "SELECT setting_value FROM automation_settings WHERE setting_key LIKE ?"
    ).all(`draft_template.${IGNORED_DRAFT_PREFIX}%`) as Array<{ setting_value: string }>
    return rows.map((row) => row.setting_value).sort()
  }

  /** Todos los drafts que Autolisty nunca debe importar, poner en el pool ni asignar. */
  templateDraftIds(): Set<string> {
    const rows = this.database.prepare(
      "SELECT setting_value FROM automation_settings WHERE setting_key LIKE 'draft_template.%'"
    ).all() as Array<{ setting_value: string }>
    return new Set(rows.map((row) => row.setting_value))
  }

  /** Marca (ignore=true) o desmarca drafts como ignorados para siempre. */
  setIgnoredDrafts(draftIds: string[], ignore: boolean) {
    const now = new Date().toISOString()
    const save = this.database.transaction(() => {
      for (const draftId of draftIds) {
        const key = `draft_template.${IGNORED_DRAFT_PREFIX}${draftId}`
        if (!ignore) {
          this.database.prepare("DELETE FROM automation_settings WHERE setting_key = ?").run(key)
          continue
        }
        const assigned = this.database.prepare(
          "SELECT 1 FROM etsy_draft_pool WHERE draft_id = ? AND status != 'AVAILABLE' UNION SELECT 1 FROM automation_jobs WHERE etsy_draft_id = ?"
        ).get(draftId, draftId)
        if (assigned) throw new Error(`Draft ${draftId} is already used by a listing; it cannot be ignored.`)
        this.database.prepare(`
          INSERT INTO automation_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at
        `).run(key, draftId, now)
        this.database.prepare("DELETE FROM etsy_draft_pool WHERE draft_id = ? AND status = 'AVAILABLE'").run(draftId)
      }
    })
    save()
    return this.getIgnoredDrafts()
  }

  /** Guarda (o borra, con null) la plantilla de un producto y la saca del pool si estaba disponible. */
  setDraftTemplate(productType: EtsyDraftPoolItem["productType"], draftId: string | null) {
    const key = `draft_template.${productType}`
    const now = new Date().toISOString()
    const save = this.database.transaction(() => {
      if (!draftId) {
        this.database.prepare("DELETE FROM automation_settings WHERE setting_key = ?").run(key)
        return
      }
      const assigned = this.database.prepare(
        "SELECT 1 FROM etsy_draft_pool WHERE draft_id = ? AND status != 'AVAILABLE' UNION SELECT 1 FROM automation_jobs WHERE etsy_draft_id = ?"
      ).get(draftId, draftId)
      if (assigned) throw new Error(`Draft ${draftId} is already used by a listing; it cannot be a template.`)
      this.database.prepare(`
        INSERT INTO automation_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at
      `).run(key, draftId, now)
      this.database.prepare("DELETE FROM etsy_draft_pool WHERE draft_id = ? AND status = 'AVAILABLE'").run(draftId)
    })
    save()
    return this.getDraftTemplates()
  }

  addDrafts(productType: EtsyDraftPoolItem["productType"], draftIds: string[]) {
    // Las plantillas nunca entran en el pool.
    const templates = this.templateDraftIds()
    const uniqueDraftIds = [...new Set(draftIds.map((value) => value.trim()))].filter((id) => !templates.has(id))
    const now = new Date().toISOString()
    const insert = this.database.prepare(`
      INSERT INTO etsy_draft_pool (
        draft_id, product_type, status, created_at, updated_at
      ) VALUES (?, ?, 'AVAILABLE', ?, ?)
      ON CONFLICT(draft_id) DO NOTHING
    `)

    const add = this.database.transaction(() => {
      let added = 0
      for (const draftId of uniqueDraftIds) {
        added += Number(insert.run(draftId, productType, now, now).changes)
      }
      return added
    })

    const added = add()
    return {
      added,
      duplicates: uniqueDraftIds.length - added,
      templatesSkipped: new Set(draftIds.map((value) => value.trim())).size - uniqueDraftIds.length,
      totalSubmitted: uniqueDraftIds.length,
    }
  }

  /** IDs de Etsy que Autolisty ya conoce (pool en cualquier estado o asignados a un trabajo). */
  knownEtsyListingIds() {
    const rows = this.database.prepare(`
      SELECT draft_id AS id FROM etsy_draft_pool
      UNION SELECT etsy_draft_id AS id FROM automation_jobs WHERE etsy_draft_id IS NOT NULL
    `).all() as Array<{ id: string }>
    // Las plantillas cuentan como conocidas: no aparecen al importar.
    return new Set([...rows.map((row) => String(row.id)), ...this.templateDraftIds()])
  }

  listDrafts(limit = 200) {
    const safeLimit = Math.max(1, Math.min(1000, Math.trunc(limit)))
    const rows = this.database.prepare(`
      SELECT * FROM etsy_draft_pool
      ORDER BY
        CASE status WHEN 'AVAILABLE' THEN 0 WHEN 'ASSIGNED' THEN 1 ELSE 2 END,
        created_at ASC
      LIMIT ?
    `).all(safeLimit) as EtsyDraftPoolRow[]
    return rows.map(mapDraft)
  }

  /** Drafts AVAILABLE de un producto. */
  countAvailableDrafts(productType: string) {
    return (this.database.prepare(
      "SELECT COUNT(*) AS count FROM etsy_draft_pool WHERE product_type = ? AND status = 'AVAILABLE'"
    ).get(productType) as { count: number }).count
  }

  /** ¿El último evento del trabajo es de este tipo? (para avisar una sola vez por espera) */
  lastEventIs(jobId: string, eventType: string) {
    const row = this.database.prepare(
      "SELECT event_type FROM automation_job_events WHERE job_id = ? ORDER BY id DESC LIMIT 1"
    ).get(jobId) as { event_type: string } | undefined
    return row?.event_type === eventType
  }

  getDraftPoolSummary() {
    const rows = this.database.prepare(`
      SELECT product_type, status, COUNT(*) AS count
      FROM etsy_draft_pool
      GROUP BY product_type, status
    `).all() as Array<{
      product_type: EtsyDraftPoolItem["productType"]
      status: EtsyDraftPoolItem["status"]
      count: number
    }>

    return rows.map((row) => ({
      productType: row.product_type,
      status: row.status,
      count: row.count,
    }))
  }

  removeAvailableDraft(draftId: string) {
    const result = this.database.prepare(`
      DELETE FROM etsy_draft_pool
      WHERE draft_id = ? AND status = 'AVAILABLE'
    `).run(draftId)
    return result.changes === 1
  }

  getAgent(agentId: string) {
    const row = this.database
      .prepare("SELECT * FROM automation_agents WHERE id = ?")
      .get(agentId) as AutomationAgentRow | undefined
    return row ? mapAgent(row) : null
  }

  touchAgent(input: {
    id: string
    name: string
    capabilities?: unknown
    status?: AutomationAgentStatus
  }) {
    const now = new Date().toISOString()
    const existing = this.getAgent(input.id)
    const status = input.status || (existing?.currentJobId ? "BUSY" : "ONLINE")
    const capabilitiesJson = input.capabilities === undefined
      ? null
      : JSON.stringify(input.capabilities)
    this.database.prepare(`
      INSERT INTO automation_agents (
        id, name, status, capabilities_json, last_seen_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        status = excluded.status,
        capabilities_json = COALESCE(excluded.capabilities_json, automation_agents.capabilities_json),
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at
    `).run(
      input.id,
      input.name,
      status,
      capabilitiesJson,
      now,
      now,
      now
    )
    return this.getAgent(input.id)!
  }

  renewAgentLease(agentId: string, leaseDurationMs = 5 * 60 * 1000) {
    const agent = this.getAgent(agentId)
    if (!agent?.currentJobId) return agent
    const now = new Date()
    this.database.prepare(`
      UPDATE automation_jobs
      SET lease_expires_at = ?, updated_at = ?
      WHERE id = ? AND local_agent_id = ?
    `).run(
      new Date(now.getTime() + leaseDurationMs).toISOString(),
      now.toISOString(),
      agent.currentJobId,
      agentId
    )
    return this.getAgent(agentId)
  }

  setAgentCurrentJob(agentId: string, jobId: string | null) {
    const now = new Date().toISOString()
    const result = this.database.prepare(`
      UPDATE automation_agents
      SET current_job_id = ?, status = ?, last_seen_at = ?, updated_at = ?
      WHERE id = ?
    `).run(jobId, jobId ? "BUSY" : "ONLINE", now, now, agentId)
    if (result.changes !== 1) throw new Error(`Automation agent not found: ${agentId}`)
    return this.getAgent(agentId)!
  }

  registerTemporarySource(
    jobId: string,
    input: {
      relativePath: string
      r2Key: string
      contentType: string
      byteSize: number
      sha256: string
    }
  ) {
    if (!this.getJob(jobId)) throw new Error(`Automation job not found: ${jobId}`)

    const now = new Date().toISOString()
    this.database.prepare(`
      INSERT INTO automation_job_files (
        id, job_id, slot_key, role, position, relative_path, r2_key,
        content_type, byte_size, sha256, status, uploaded_at, created_at, updated_at
      ) VALUES (?, ?, 'source:primary', 'TEMPORARY_SOURCE', 0, ?, ?, ?, ?, ?, 'UPLOADED', ?, ?, ?)
      ON CONFLICT(job_id, slot_key) DO UPDATE SET
        relative_path = excluded.relative_path,
        r2_key = excluded.r2_key,
        content_type = excluded.content_type,
        byte_size = excluded.byte_size,
        sha256 = excluded.sha256,
        status = 'UPLOADED',
        uploaded_at = excluded.uploaded_at,
        verified_at = NULL,
        deleted_at = NULL,
        last_error = NULL,
        updated_at = excluded.updated_at
    `).run(
      crypto.randomUUID(),
      jobId,
      input.relativePath,
      input.r2Key,
      input.contentType,
      input.byteSize,
      input.sha256,
      now,
      now,
      now
    )

    return this.listJobFiles(jobId).find((file) => file.slotKey === "source:primary")!
  }

  registerOutputUpload(
    jobId: string,
    input: {
      slotKey: string
      role: string
      position: number | null
      relativePath: string
      r2Key: string
      contentType: string
      byteSize: number
      sha256: string
    }
  ) {
    if (!this.getJob(jobId)) throw new Error(`Automation job not found: ${jobId}`)
    const now = new Date().toISOString()
    this.database.prepare(`
      INSERT INTO automation_job_files (
        id, job_id, slot_key, role, position, relative_path, r2_key,
        content_type, byte_size, sha256, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UPLOADING', ?, ?)
      ON CONFLICT(job_id, slot_key) DO UPDATE SET
        role = excluded.role,
        position = excluded.position,
        relative_path = excluded.relative_path,
        r2_key = excluded.r2_key,
        content_type = excluded.content_type,
        byte_size = excluded.byte_size,
        sha256 = excluded.sha256,
        status = 'UPLOADING',
        uploaded_at = NULL,
        verified_at = NULL,
        deleted_at = NULL,
        last_error = NULL,
        updated_at = excluded.updated_at
    `).run(
      crypto.randomUUID(), jobId, input.slotKey, input.role, input.position,
      input.relativePath, input.r2Key, input.contentType, input.byteSize,
      input.sha256, now, now
    )
    return this.listJobFiles(jobId).find((file) => file.slotKey === input.slotKey)!
  }

  verifyOutputUpload(jobId: string, slotKey: string) {
    const now = new Date().toISOString()
    const result = this.database.prepare(`
      UPDATE automation_job_files
      SET status = 'VERIFIED', uploaded_at = COALESCE(uploaded_at, ?),
          verified_at = ?, last_error = NULL, updated_at = ?
      WHERE job_id = ? AND slot_key = ? AND status IN ('UPLOADING', 'UPLOADED', 'VERIFIED')
    `).run(now, now, now, jobId, slotKey)
    if (result.changes !== 1) throw new Error(`Output slot is not registered: ${slotKey}`)
    return this.listJobFiles(jobId).find((file) => file.slotKey === slotKey)!
  }

  verifyTemporarySource(jobId: string) {
    const now = new Date().toISOString()
    const result = this.database.prepare(`
      UPDATE automation_job_files
      SET status = 'VERIFIED', verified_at = ?, updated_at = ?
      WHERE job_id = ? AND slot_key = 'source:primary' AND status = 'UPLOADED'
    `).run(now, now, jobId)
    if (result.changes !== 1) throw new Error("Temporary source is not ready for verification.")
  }

  /** Marca como borrados todos los archivos del trabajo (tras borrarlos de R2). */
  markAllFilesDeleted(jobId: string) {
    const now = new Date().toISOString()
    this.database.prepare(`
      UPDATE automation_job_files
      SET status = 'DELETED', deleted_at = ?, updated_at = ?
      WHERE job_id = ? AND status != 'DELETED'
    `).run(now, now, jobId)
  }

  markTemporarySourceDeleted(jobId: string) {
    const now = new Date().toISOString()
    const result = this.database.prepare(`
      UPDATE automation_job_files
      SET status = 'DELETED', r2_key = NULL, deleted_at = ?, updated_at = ?
      WHERE job_id = ? AND slot_key = 'source:primary' AND status IN ('UPLOADED', 'VERIFIED')
    `).run(now, now, jobId)
    if (result.changes !== 1) throw new Error("Temporary source is not available for deletion.")
  }

  getPipelineMode(): AutomationPipelineMode {
    const row = this.database
      .prepare("SELECT setting_value FROM automation_settings WHERE setting_key = ?")
      .get(PIPELINE_MODE_SETTING) as { setting_value: AutomationPipelineMode } | undefined
    // Sin ajuste guardado la producción está activa: Automaty trabaja al encenderse.
    return row?.setting_value || "RUNNING"
  }

  setPipelineMode(mode: AutomationPipelineMode) {
    const now = new Date().toISOString()
    this.database.prepare(`
      INSERT INTO automation_settings (setting_key, setting_value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET
        setting_value = excluded.setting_value,
        updated_at = excluded.updated_at
    `).run(PIPELINE_MODE_SETTING, mode, now)
    return mode
  }

  // Pausa: Automaty termina el listing que esté produciendo y no empieza otro.
  requestPipelinePause() {
    return this.setPipelineMode("PAUSED")
  }

  resumePipeline() {
    return this.setPipelineMode("RUNNING")
  }

  hasProductionBlockingJob() {
    const placeholders = PRODUCTION_BLOCKING_STATUSES.map(() => "?").join(", ")
    const row = this.database.prepare(`
      SELECT 1 AS found
      FROM automation_jobs
      WHERE status IN (${placeholders})
         OR (status IN ('RETRY_WAIT', 'NEEDS_ATTENTION') AND resume_status IN (${placeholders}))
      LIMIT 1
    `).get(...PRODUCTION_BLOCKING_STATUSES, ...PRODUCTION_BLOCKING_STATUSES) as
      | { found: number }
      | undefined
    return Boolean(row?.found)
  }

  claimNextQueuedJob(agentId: string, leaseDurationMs = 5 * 60 * 1000) {
    const claim = this.database.transaction(() => {
      if (this.getPipelineMode() !== "RUNNING" || this.hasProductionBlockingJob()) return null

      const next = this.database.prepare(`
        SELECT id FROM automation_jobs
        WHERE status = 'QUEUED_LOCAL'
        ORDER BY created_at ASC
        LIMIT 1
      `).get() as { id: string } | undefined
      if (!next) return null

      const now = new Date()
      const result = this.database.prepare(`
        UPDATE automation_jobs
        SET status = 'LOCAL_CLAIMED', local_agent_id = ?, lease_expires_at = ?, updated_at = ?
        WHERE id = ? AND status = 'QUEUED_LOCAL'
      `).run(
        agentId,
        new Date(now.getTime() + leaseDurationMs).toISOString(),
        now.toISOString(),
        next.id
      )
      if (result.changes !== 1) return null

      this.database.prepare(`
        INSERT INTO automation_job_events (
          job_id, event_type, from_status, to_status, message, created_at
        ) VALUES (?, 'JOB_CLAIMED', 'QUEUED_LOCAL', 'LOCAL_CLAIMED', ?, ?)
      `).run(next.id, `Claimed by local agent ${agentId}.`, now.toISOString())

      this.database.prepare(`
        UPDATE automation_agents
        SET current_job_id = ?, status = 'BUSY', last_seen_at = ?, updated_at = ?
        WHERE id = ?
      `).run(next.id, now.toISOString(), now.toISOString(), agentId)

      return this.getJob(next.id)
    })

    return claim()
  }

  transitionJob(
    jobId: string,
    nextStatus: AutomationJobStatus,
    options: {
      message?: string
      error?: string | null
      resumeStatus?: AutomationJobStatus | null
      nextAttemptAt?: string | null
    } = {}
  ) {
    const transition = this.database.transaction(() => {
      const current = this.getJob(jobId)
      if (!current) throw new Error(`Automation job not found: ${jobId}`)

      const recoveryTarget =
        current.status === "RETRY_WAIT" || current.status === "NEEDS_ATTENTION"
          ? current.resumeStatus
          : options.resumeStatus ?? null

      assertAutomationTransition(current.status, nextStatus, recoveryTarget)

      const now = new Date().toISOString()
      const enteringFailure = nextStatus === "RETRY_WAIT" || nextStatus === "NEEDS_ATTENTION"
      const leavingFailure = current.status === "RETRY_WAIT" || current.status === "NEEDS_ATTENTION"
      const resumeStatus = enteringFailure
        ? options.resumeStatus || current.status
        : leavingFailure
          ? null
          : current.resumeStatus
      const completedAt = nextStatus === "COMPLETED" ? now : current.completedAt

      this.database.prepare(`
        UPDATE automation_jobs
        SET status = ?, resume_status = ?, last_error = ?, next_attempt_at = ?,
            retry_count = ?, updated_at = ?, completed_at = ?
        WHERE id = ?
      `).run(
        nextStatus,
        resumeStatus,
        options.error ?? (leavingFailure ? null : current.lastError),
        options.nextAttemptAt ?? null,
        // Los reintentos automáticos cuentan por paso: al superar un paso vuelven a cero.
        enteringFailure ? current.retryCount + 1 : leavingFailure ? current.retryCount : 0,
        now,
        completedAt,
        jobId
      )

      this.database.prepare(`
        INSERT INTO automation_job_events (
          job_id, event_type, from_status, to_status, message, created_at
        ) VALUES (?, 'STATUS_CHANGED', ?, ?, ?, ?)
      `).run(jobId, current.status, nextStatus, options.message || null, now)

      // Un fallo en Automaty (Photoshop, Upscayl, archivos) pausa la producción local
      // para no repetir el error en toda la cola. Los fallos de pasos de servidor no.
      if (nextStatus === "NEEDS_ATTENTION" && LOCAL_PRODUCTION_STATUSES.includes(resumeStatus as AutomationJobStatus)) {
        this.setPipelineMode("PAUSED")
      }

      return this.getJob(jobId)!
    })

    return transition()
  }

  getJobByProductCode(productCode: string) {
    const row = this.database
      .prepare("SELECT * FROM automation_jobs WHERE product_code = ?")
      .get(productCode) as AutomationJobRow | undefined
    return row ? mapJob(row) : null
  }

  // ---- Postproducción en el servidor (después de LOCAL_COMPLETE) ----

  /** Trabajos que el worker del servidor debe avanzar, los más antiguos primero. */
  listPostProductionJobs(statuses: readonly AutomationJobStatus[], limit = 20) {
    const placeholders = statuses.map(() => "?").join(", ")
    const rows = this.database.prepare(`
      SELECT * FROM automation_jobs
      WHERE status IN (${placeholders})
        AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      ORDER BY priority DESC, updated_at ASC
      LIMIT ?
    `).all(...statuses, new Date().toISOString(), Math.max(1, Math.min(200, limit))) as AutomationJobRow[]
    return rows.map(mapJob)
  }

  /** «Comprobar ahora»: los drafts que esperan tu revisión se consultan en el próximo minuto. */
  checkReviewNow() {
    return this.database.prepare(
      "UPDATE automation_jobs SET next_attempt_at = ? WHERE status = 'WAITING_ETSY_REVIEW'"
    ).run(new Date().toISOString()).changes
  }

  /** El draft disponible más antiguo de un producto, sin asignarlo. */
  peekAvailableDraft(productType: string) {
    const row = this.database.prepare(`
      SELECT draft_id FROM etsy_draft_pool
      WHERE product_type = ? AND status = 'AVAILABLE'
        AND draft_id NOT IN (SELECT value FROM json_each(?))
      ORDER BY created_at ASC
      LIMIT 1
    `).get(productType, JSON.stringify([...this.templateDraftIds()])) as { draft_id: string } | undefined
    return row?.draft_id ?? null
  }

  /** Un draft que ya no sirve (borrado o publicado a mano en Etsy). */
  markDraftInvalid(draftId: string) {
    this.database.prepare("UPDATE etsy_draft_pool SET status = 'INVALID', updated_at = ? WHERE draft_id = ? AND status = 'AVAILABLE'")
      .run(new Date().toISOString(), draftId)
  }

  /** Asigna el draft disponible más antiguo de su producto (o el indicado). null si no queda ninguno. */
  assignDraftToJob(jobId: string, preferred?: { draftId: string; taxonomyId?: number | null }) {
    const assign = this.database.transaction(() => {
      const job = this.getJob(jobId)
      if (!job) throw new Error(`Automation job not found: ${jobId}`)
      if (job.etsyDraftId) return job.etsyDraftId
      const templates = [...this.templateDraftIds()]
      const draft = this.database.prepare(`
        SELECT draft_id FROM etsy_draft_pool
        WHERE product_type = ? AND status = 'AVAILABLE'
          AND draft_id NOT IN (SELECT value FROM json_each(?))
          AND (? IS NULL OR draft_id = ?)
        ORDER BY created_at ASC
        LIMIT 1
      `).get(job.productType, JSON.stringify(templates), preferred?.draftId ?? null, preferred?.draftId ?? null) as { draft_id: string } | undefined
      if (!draft) return null
      const now = new Date().toISOString()
      this.database.prepare(`
        UPDATE etsy_draft_pool
        SET status = 'ASSIGNED', assigned_job_id = ?, assigned_at = ?, updated_at = ?,
            taxonomy_id = COALESCE(?, taxonomy_id)
        WHERE draft_id = ? AND status = 'AVAILABLE'
      `).run(jobId, now, now, preferred?.taxonomyId ?? null, draft.draft_id)
      this.database.prepare("UPDATE automation_jobs SET etsy_draft_id = ?, updated_at = ? WHERE id = ?")
        .run(draft.draft_id, now, jobId)
      return draft.draft_id
    })
    return assign()
  }

  updatePostProductionFields(jobId: string, fields: {
    seoJson?: string | null
    pinterestSeoJson?: string | null
    deliveryUrl?: string | null
    deliveryFilename?: string | null
    etsyState?: string | null
    etsyUrl?: string | null
    nextAttemptAt?: string | null
  }) {
    const columns: Record<string, string> = {
      seoJson: "seo_json",
      pinterestSeoJson: "pinterest_seo_json",
      deliveryUrl: "delivery_url",
      deliveryFilename: "delivery_filename",
      etsyState: "etsy_state",
      etsyUrl: "etsy_url",
      nextAttemptAt: "next_attempt_at",
    }
    const entries = Object.entries(fields).filter(([key, value]) => key in columns && value !== undefined)
    if (entries.length === 0) return this.getJob(jobId)
    const assignments = entries.map(([key]) => `${columns[key]} = ?`).join(", ")
    this.database.prepare(`UPDATE automation_jobs SET ${assignments}, updated_at = ? WHERE id = ?`)
      .run(...entries.map(([, value]) => value), new Date().toISOString(), jobId)
    return this.getJob(jobId)
  }

  recordJobEvent(jobId: string, eventType: string, message: string, metadata: unknown = null) {
    this.database.prepare(`
      INSERT INTO automation_job_events (job_id, event_type, message, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(jobId, eventType, message.slice(0, 500), metadata === null ? null : JSON.stringify(metadata), new Date().toISOString())
  }

  countByStatus() {
    const rows = this.database
      .prepare("SELECT status, COUNT(*) AS count FROM automation_jobs GROUP BY status")
      .all() as Array<{ status: AutomationJobStatus; count: number }>
    return Object.fromEntries(rows.map((row) => [row.status, row.count]))
  }

  hasOpenJobs() {
    const terminalStatuses: AutomationJobStatus[] = ["COMPLETED", "CANCELED"]
    const placeholders = terminalStatuses.map(() => "?").join(", ")
    const row = this.database
      .prepare(`SELECT 1 AS found FROM automation_jobs WHERE status NOT IN (${placeholders}) LIMIT 1`)
      .get(...terminalStatuses) as { found: number } | undefined
    return Boolean(row?.found)
  }

  isTerminal(jobId: string) {
    const job = this.getJob(jobId)
    return job ? isTerminalAutomationStatus(job.status) : false
  }
}
