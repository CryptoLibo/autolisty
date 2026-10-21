import crypto from "node:crypto"
import type Database from "better-sqlite3"
import { generateProductCode, isProductCode } from "../utils/generateListingId"
import { getAutomationDatabase } from "./db/database"
import { assertAutomationTransition, isTerminalAutomationStatus } from "./stateMachine"
import type {
  AutomationJob,
  AutomationJobEvent,
  AutomationJobFile,
  AutomationJobStatus,
  AutomationAgent,
  AutomationAgentStatus,
  AutomationPipelineMode,
  CreateAutomationJobInput,
  EtsyDraftPoolItem,
} from "./types"

type AutomationJobRow = {
  id: string
  company_listing_id: string | null
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
const PRODUCTION_BLOCKING_STATUSES: AutomationJobStatus[] = [
  "LOCAL_CLAIMED",
  "LOCAL_BUILDING",
  "LOCAL_VALIDATING",
  "LOCAL_UPLOADING",
  "LOCAL_COMPLETE",
  "DRAFT_ASSIGNED",
  "SEO_GENERATING",
  "SEO_READY",
  "PINTEREST_SEO_GENERATING",
  "PINTEREST_SEO_READY",
  "DELIVERY_PREPARING",
  "DELIVERY_READY",
  "ETSY_TEXT_SYNCING",
  "ETSY_MEDIA_SYNCING",
  "ETSY_FILE_SYNCING",
  "ETSY_VIDEO_SYNCING",
]

function mapJob(row: AutomationJobRow): AutomationJob {
  return {
    id: row.id,
    companyListingId: row.company_listing_id,
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

export class AutomationRepository {
  constructor(private readonly database: Database.Database = getAutomationDatabase()) {}

  createJob(input: CreateAutomationJobInput) {
    const now = new Date().toISOString()
    const jobId = crypto.randomUUID()
    const sourcePrompt = input.sourcePrompt.trim()

    if (!sourcePrompt) throw new Error("Automation jobs require a source prompt.")
    if (input.productCode !== undefined && !isProductCode(input.productCode)) throw new Error("Invalid product code.")
    if (input.companyListingId && !input.productCode) throw new Error("Company jobs require their listing product code.")
    if (input.companyListingId && !/^[0-9a-f-]{36}$/i.test(input.companyListingId)) throw new Error("Invalid Company listing ID.")

    const existingCompanyJob = input.companyListingId ? this.findCompanyJob(input.companyListingId) : null
    if (existingCompanyJob) {
      if (existingCompanyJob.productCode !== input.productCode || existingCompanyJob.productType !== input.productType || existingCompanyJob.sourcePrompt !== sourcePrompt) {
        throw new Error("Company listing already has a different Automation job.")
      }
      return existingCompanyJob
    }

    const insert = this.database.prepare(`
      INSERT INTO automation_jobs (
        id, product_code, product_type, source_prompt, company_listing_id, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'CREATED', ?, ?)
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
          insert.run(jobId, productCode, input.productType, sourcePrompt, input.companyListingId || null, now, now)
          insertEvent.run(jobId, `Automation job ${productCode} created.`, now)
          return productCode
        } catch (error) {
          if (String(error).includes("automation_jobs.product_code")) {
            if (input.productCode) throw new Error("Product code is already assigned to an Automation job.")
            continue
          }
          if (String(error).includes("automation_jobs.company_listing_id")) {
            const existing = this.findCompanyJob(input.companyListingId!)
            if (existing && existing.productCode === input.productCode && existing.productType === input.productType && existing.sourcePrompt === sourcePrompt) return existing.productCode
            throw new Error("Company listing already has a different Automation job.")
          }
          throw error
        }
      }

      throw new Error("Unable to allocate a unique product code.")
    })

    const code = create()
    return this.getJob(jobId) || this.findJobByCode(code)!
  }

  findCompanyJob(companyListingId: string) {
    const row = this.database.prepare("SELECT * FROM automation_jobs WHERE company_listing_id=?").get(companyListingId) as AutomationJobRow | undefined
    return row ? mapJob(row) : null
  }

  findJobByCode(productCode: string) {
    const row = this.database.prepare("SELECT * FROM automation_jobs WHERE product_code=?").get(productCode) as AutomationJobRow | undefined
    return row ? mapJob(row) : null
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

  addDrafts(productType: EtsyDraftPoolItem["productType"], draftIds: string[]) {
    const uniqueDraftIds = [...new Set(draftIds.map((value) => value.trim()))]
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
      totalSubmitted: uniqueDraftIds.length,
    }
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
    return row?.setting_value || "PAUSED"
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

  requestPipelinePause() {
    return this.setPipelineMode(
      this.hasProductionBlockingJob() ? "STOPPING_AFTER_CURRENT" : "PAUSED"
    )
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
        enteringFailure ? current.retryCount + 1 : current.retryCount,
        now,
        completedAt,
        jobId
      )

      this.database.prepare(`
        INSERT INTO automation_job_events (
          job_id, event_type, from_status, to_status, message, created_at
        ) VALUES (?, 'STATUS_CHANGED', ?, ?, ?, ?)
      `).run(jobId, current.status, nextStatus, options.message || null, now)

      if (nextStatus === "NEEDS_ATTENTION") {
        this.setPipelineMode("PAUSED")
      } else if (
        nextStatus === "WAITING_ETSY_REVIEW" &&
        this.getPipelineMode() === "STOPPING_AFTER_CURRENT"
      ) {
        this.setPipelineMode("PAUSED")
      }

      return this.getJob(jobId)!
    })

    return transition()
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
