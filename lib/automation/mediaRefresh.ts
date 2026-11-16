// Regenerar medios de un listing ya terminado (mockups y/o vídeo) y sustituirlos en Etsy.
//
// Flujo:
// 1. Se encola (MCP refresh_listing_media, con aprobación del dueño).
// 2. Automaty lo recoge en /sync cuando no tiene listings que producir: descarga el
//    diseño final desde R2 (el entregable de mayor tamaño), lo produce de nuevo con
//    Autobuildy y sube SOLO los medios del listing a R2 en una carpeta propia.
// 3. El worker de Autolisty sustituye en Etsy las fotos generadas (no las fijas de la
//    tienda) con su alt text nuevo, y el vídeo. Título, tags, precio y ventas no se tocan.
import crypto from "node:crypto"
import type Database from "better-sqlite3"
import { getAutomationDatabase } from "./db/database"
import { getProductionProductContract } from "./productContracts"
import type { AutomationRepository } from "./repository"
import type { AutomationJob } from "./types"
import { getProductOption, type ProductType } from "../products"
import type { EtsyTokenPayload } from "../etsy/auth"

export type MediaRefreshScope = "images_video" | "video"
export type MediaRefreshStatus =
  | "QUEUED"
  | "LOCAL_BUILDING"
  | "LOCAL_UPLOADING"
  | "UPLOADED"
  | "APPLYING"
  | "DONE"
  | "FAILED"
  | "CANCELED"

export const MEDIA_REFRESH_ACTIVE: readonly MediaRefreshStatus[] = ["QUEUED", "LOCAL_BUILDING", "LOCAL_UPLOADING", "UPLOADED", "APPLYING"]
export const MEDIA_REFRESH_MAX_ATTEMPTS = 3

export type MediaRefresh = {
  id: string
  jobId: string
  scope: MediaRefreshScope
  status: MediaRefreshStatus
  agentId: string | null
  attempts: number
  message: string | null
  lastError: string | null
  nextAttemptAt: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export type MediaRefreshFile = {
  slotKey: string
  relativePath: string
  r2Key: string
  contentType: string
  byteSize: number
  sha256: string
  verifiedAt: string | null
}

type Row = Record<string, unknown>

function mapRefresh(row: Row): MediaRefresh {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    scope: row.scope as MediaRefreshScope,
    status: row.status as MediaRefreshStatus,
    agentId: (row.agent_id as string | null) ?? null,
    attempts: Number(row.attempts || 0),
    message: (row.message as string | null) ?? null,
    lastError: (row.last_error as string | null) ?? null,
    nextAttemptAt: (row.next_attempt_at as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: (row.completed_at as string | null) ?? null,
  }
}

function mapFile(row: Row): MediaRefreshFile {
  return {
    slotKey: String(row.slot_key),
    relativePath: String(row.relative_path),
    r2Key: String(row.r2_key),
    contentType: String(row.content_type),
    byteSize: Number(row.byte_size),
    sha256: String(row.sha256),
    verifiedAt: (row.verified_at as string | null) ?? null,
  }
}

/** Horizontal tenía mockups mal montados: fotos y vídeo. El resto, solo el vídeo. */
export function refreshScopeFor(productType: string): MediaRefreshScope {
  return productType === "horizontal_wall_art" ? "images_video" : "video"
}

/** Posiciones del listing (archivos 1.jpg, 2.mp4, 12.jpg...) que hay que volver a subir. */
export function refreshSlots(productType: ProductType, scope: MediaRefreshScope) {
  const contract = getProductionProductContract(productType)
  const video = contract.listing.videoSlot
  if (scope === "video") return [video]
  const fixed = new Set<number>(contract.listing.fixedImageSlots)
  const images = contract.listing.etsyImageOrder.filter((slot) => !fixed.has(slot))
  return [...images, video]
}

/** Clave en R2 de un medio regenerado: carpeta propia, sin pisar los originales. */
export function refreshR2Key(productCode: string, refreshId: string, relativePath: string) {
  const filename = relativePath.split("/").pop() || relativePath
  return `mockups/${productCode}/refresh-${refreshId.slice(0, 8)}/${filename}`
}

/** El entregable más grande sirve de fuente para volver a producir los mockups. */
export function refreshSourceSlot(productType: ProductType) {
  const preferred: Record<ProductType, string> = {
    vertical_wall_art: "deliverable:ratio_2_3",
    nursery_wall_art: "deliverable:ratio_2_3",
    horizontal_wall_art: "deliverable:ratio_3_2",
    frame_tv_art: "deliverable:design",
    png_designs: "deliverable:design",
  }
  return preferred[productType]
}

export class MediaRefreshRepository {
  constructor(private readonly database: Database.Database = getAutomationDatabase()) {}

  enqueue(jobId: string, scope: MediaRefreshScope, message: string | null = null) {
    const existing = this.database.prepare(`
      SELECT * FROM automation_media_refreshes
      WHERE job_id = ? AND status IN (${MEDIA_REFRESH_ACTIVE.map(() => "?").join(",")})
      ORDER BY created_at DESC LIMIT 1
    `).get(jobId, ...MEDIA_REFRESH_ACTIVE) as Row | undefined
    if (existing) return { refresh: mapRefresh(existing), created: false }
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    this.database.prepare(`
      INSERT INTO automation_media_refreshes (id, job_id, scope, status, message, created_at, updated_at)
      VALUES (?, ?, ?, 'QUEUED', ?, ?, ?)
    `).run(id, jobId, scope, message, now, now)
    return { refresh: this.get(id)!, created: true }
  }

  get(id: string) {
    const row = this.database.prepare("SELECT * FROM automation_media_refreshes WHERE id = ?").get(id) as Row | undefined
    return row ? mapRefresh(row) : null
  }

  list(limit = 100) {
    return (this.database.prepare("SELECT * FROM automation_media_refreshes ORDER BY created_at DESC LIMIT ?").all(limit) as Row[]).map(mapRefresh)
  }

  countByStatus() {
    const rows = this.database.prepare("SELECT status, COUNT(*) AS n FROM automation_media_refreshes GROUP BY status").all() as Array<{ status: string; n: number }>
    return Object.fromEntries(rows.map((row) => [row.status, Number(row.n)]))
  }

  /** La que el agente ya tenía a medias; si no, la más antigua en cola. */
  claimForAgent(agentId: string) {
    const current = this.database.prepare(`
      SELECT * FROM automation_media_refreshes
      WHERE agent_id = ? AND status IN ('LOCAL_BUILDING', 'LOCAL_UPLOADING')
      ORDER BY created_at ASC LIMIT 1
    `).get(agentId) as Row | undefined
    if (current) return mapRefresh(current)
    const queued = this.database.prepare(`
      SELECT * FROM automation_media_refreshes WHERE status = 'QUEUED' ORDER BY created_at ASC LIMIT 1
    `).get() as Row | undefined
    if (!queued) return null
    const now = new Date().toISOString()
    this.database.prepare(`
      UPDATE automation_media_refreshes SET status = 'LOCAL_BUILDING', agent_id = ?, updated_at = ?
      WHERE id = ? AND status = 'QUEUED'
    `).run(agentId, now, queued.id)
    return this.get(String(queued.id))
  }

  update(id: string, fields: Partial<Pick<MediaRefresh, "status" | "message" | "lastError" | "nextAttemptAt" | "attempts" | "completedAt" | "agentId">>) {
    const columns: Record<string, string> = {
      status: "status", message: "message", lastError: "last_error", nextAttemptAt: "next_attempt_at",
      attempts: "attempts", completedAt: "completed_at", agentId: "agent_id",
    }
    const sets: string[] = []
    const values: unknown[] = []
    for (const [key, value] of Object.entries(fields)) {
      if (!(key in columns) || value === undefined) continue
      sets.push(`${columns[key]} = ?`)
      values.push(value)
    }
    sets.push("updated_at = ?")
    values.push(new Date().toISOString())
    this.database.prepare(`UPDATE automation_media_refreshes SET ${sets.join(", ")} WHERE id = ?`).run(...values, id)
    return this.get(id)!
  }

  registerFile(refreshId: string, file: Omit<MediaRefreshFile, "verifiedAt">) {
    this.database.prepare(`
      INSERT INTO automation_media_refresh_files (refresh_id, slot_key, relative_path, r2_key, content_type, byte_size, sha256, verified_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(refresh_id, slot_key) DO UPDATE SET
        relative_path = excluded.relative_path, r2_key = excluded.r2_key, content_type = excluded.content_type,
        byte_size = excluded.byte_size, sha256 = excluded.sha256, verified_at = NULL
    `).run(refreshId, file.slotKey, file.relativePath, file.r2Key, file.contentType, file.byteSize, file.sha256)
  }

  verifyFile(refreshId: string, slotKey: string) {
    const result = this.database.prepare(`
      UPDATE automation_media_refresh_files SET verified_at = ? WHERE refresh_id = ? AND slot_key = ?
    `).run(new Date().toISOString(), refreshId, slotKey)
    if (result.changes !== 1) throw new Error(`Refresh slot is not registered: ${slotKey}`)
  }

  listFiles(refreshId: string) {
    return (this.database.prepare("SELECT * FROM automation_media_refresh_files WHERE refresh_id = ?").all(refreshId) as Row[]).map(mapFile)
  }

  nextToApply(now: Date) {
    const row = this.database.prepare(`
      SELECT * FROM automation_media_refreshes
      WHERE status IN ('UPLOADED', 'APPLYING') AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      ORDER BY updated_at ASC LIMIT 1
    `).get(now.toISOString()) as Row | undefined
    return row ? mapRefresh(row) : null
  }
}

// ---- Aplicar en Etsy ----

export type MediaRefreshApplyDeps = {
  refreshes: MediaRefreshRepository
  repository: AutomationRepository
  getEtsyToken: () => Promise<EtsyTokenPayload | null>
  getShopId: (token: EtsyTokenPayload) => Promise<number>
  publicUrl: (r2Key: string) => string
  /** Sustituye la foto de cada posición (las demás no se tocan). */
  replaceImage: (ref: { token: EtsyTokenPayload; shopId: number; listingId: string }, image: { url: string; rank: number; altText?: string }) => Promise<void>
  /** Borra el vídeo actual del listing y sube el nuevo. */
  replaceVideo: (ref: { token: EtsyTokenPayload; shopId: number; listingId: string }, video: { url: string; name: string }) => Promise<void>
  /** Alt text nuevo para cada foto, a partir de la imagen real. */
  generateAltTexts: (input: { productType: ProductType; listingTitle: string; images: Array<{ position: number; url: string }> }) => Promise<Map<number, string>>
  /** Título actual del listing en Etsy (para el alt text). */
  getListingTitle: (ref: { token: EtsyTokenPayload; shopId: number; listingId: string }) => Promise<string | null>
  notify?: (input: { title: string; body: string; url?: string; tag?: string }) => Promise<void>
  now?: () => Date
}

function errorText(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000)
}

/** Aplica en Etsy, como mucho, una regeneración subida a R2. */
export async function applyNextMediaRefresh(deps: MediaRefreshApplyDeps) {
  const now = (deps.now || (() => new Date()))()
  const refresh = deps.refreshes.nextToApply(now)
  if (!refresh) return null
  const job = deps.repository.getJob(refresh.jobId) as AutomationJob | null
  if (!job?.etsyDraftId) {
    deps.refreshes.update(refresh.id, { status: "FAILED", lastError: "El listing no tiene id de Etsy." })
    return refresh.id
  }
  deps.refreshes.update(refresh.id, { status: "APPLYING", attempts: refresh.attempts + 1 })
  try {
    const token = await deps.getEtsyToken()
    if (!token) throw new Error("Etsy no está conectado en Autolisty.")
    const ref = { token, shopId: await deps.getShopId(token), listingId: job.etsyDraftId }
    const files = new Map(deps.refreshes.listFiles(refresh.id).filter((file) => file.verifiedAt).map((file) => [file.slotKey, file]))
    const contract = getProductionProductContract(job.productType)
    const productType = job.productType as ProductType
    let replacedImages = 0

    if (refresh.scope === "images_video") {
      const fixed = new Set<number>(contract.listing.fixedImageSlots)
      const images = contract.listing.etsyImageOrder
        .map((slot, index) => ({ slot, rank: index + 1 }))
        .filter(({ slot }) => !fixed.has(slot))
        .map(({ slot, rank }) => {
          const file = files.get(`listing:${slot}`)
          if (!file) throw new Error(`Falta la foto regenerada ${slot}.`)
          return { slot, rank, url: deps.publicUrl(file.r2Key) }
        })
      const title = (await deps.getListingTitle(ref)) || job.productCode
      const alts = await deps.generateAltTexts({
        productType,
        listingTitle: title,
        images: images.map((image) => ({ position: image.rank, url: image.url })),
      })
      for (const image of images) {
        await deps.replaceImage(ref, { url: image.url, rank: image.rank, altText: alts.get(image.rank) })
        replacedImages += 1
      }
    }

    const video = files.get(`listing:${contract.listing.videoSlot}`)
    let videoReplaced = false
    if (video) {
      await deps.replaceVideo(ref, { url: deps.publicUrl(video.r2Key), name: `${job.productCode}.mp4` })
      videoReplaced = true
    }

    const message = `${replacedImages ? `${replacedImages} fotos` : "Fotos sin cambios"} y ${videoReplaced ? "vídeo nuevo" : "sin vídeo"} en Etsy.`
    deps.refreshes.update(refresh.id, { status: "DONE", message, lastError: null, completedAt: now.toISOString(), nextAttemptAt: null })
    deps.repository.recordJobEvent(job.id, "MEDIA_REFRESHED", `Medios regenerados: ${message}`)
    if (!video) deps.repository.recordJobEvent(job.id, "WARNING", "Regeneración sin vídeo: Automaty no generó vídeo (revisa el vídeo de fondo del PSD).")
    const pending = MEDIA_REFRESH_ACTIVE.reduce((sum, status) => sum + (deps.refreshes.countByStatus()[status] || 0), 0)
    if (pending === 0) {
      await deps.notify?.({ title: "Medios regenerados", body: "Terminó la regeneración de mockups y vídeos en Etsy.", url: "/automation", tag: "media-refresh" }).catch(() => {})
    }
  } catch (error) {
    const attempts = refresh.attempts + 1
    const failed = attempts >= MEDIA_REFRESH_MAX_ATTEMPTS
    deps.refreshes.update(refresh.id, {
      status: failed ? "FAILED" : "UPLOADED",
      lastError: errorText(error),
      nextAttemptAt: failed ? null : new Date(now.getTime() + 15 * 60_000).toISOString(),
    })
    deps.repository.recordJobEvent(job.id, "WARNING", `Regeneración de medios ${failed ? "fallida" : "pendiente de reintento"}: ${errorText(error).slice(0, 300)}`)
    if (failed) {
      await deps.notify?.({ title: "Regeneración de medios fallida", body: `${job.productCode}: ${errorText(error).slice(0, 200)}`, url: "/automation", tag: `media-refresh-${job.productCode}` }).catch(() => {})
    }
  }
  return refresh.id
}

export function deliverableFieldIds(productType: ProductType) {
  return getProductOption(productType).delivery.fields.map((field) => field.id)
}

// ---- Encolar (herramienta MCP refresh_listing_media) ----

/**
 * Encola la regeneración de medios de listings ya terminados. Solo con aprobación
 * explícita del dueño. Sin productCodes y con allCompleted=true, encola todos los
 * listings terminados por la automatización.
 */
export function requestMediaRefresh(
  input: Record<string, unknown>,
  deps: { repository: AutomationRepository; refreshes?: MediaRefreshRepository }
) {
  if (input.ownerApproved !== true) {
    throw new Error("Regenerating published media needs the owner's explicit approval in the conversation (ownerApproved=true).")
  }
  const refreshes = deps.refreshes || new MediaRefreshRepository()
  const codes = Array.isArray(input.productCodes)
    ? input.productCodes.map((code) => String(code).trim()).filter(Boolean)
    : []
  const productTypes = Array.isArray(input.productTypes) ? new Set(input.productTypes.map(String)) : null
  let jobs: AutomationJob[] = []
  if (codes.length) {
    jobs = codes.map((code) => {
      const job = deps.repository.getJobByProductCode(code)
      if (!job) throw new Error(`Unknown product code: ${code}`)
      return job
    })
  } else if (input.allCompleted === true) {
    jobs = deps.repository.listPostProductionJobs(["COMPLETED", "PINTEREST_PUBLISHING"], 500)
  } else {
    throw new Error("Give productCodes or allCompleted=true.")
  }
  if (productTypes) jobs = jobs.filter((job) => productTypes.has(job.productType))
  const results = []
  for (const job of jobs) {
    if (!job.etsyDraftId || !["COMPLETED", "PINTEREST_PUBLISHING", "ETSY_ACTIVE"].includes(job.status)) {
      results.push({ productCode: job.productCode, queued: false, reason: `status ${job.status}` })
      continue
    }
    const scope = input.scope === "video" ? "video" : refreshScopeFor(job.productType)
    const { refresh, created } = refreshes.enqueue(job.id, scope, typeof input.reason === "string" ? input.reason.slice(0, 300) : null)
    results.push({ productCode: job.productCode, queued: created, alreadyQueued: !created, scope: refresh.scope, refreshId: refresh.id })
  }
  return { queued: results.filter((item) => item.queued).length, results }
}

/** Resumen para get_status. */
export function mediaRefreshSummary(refreshes = new MediaRefreshRepository()) {
  const recent = refreshes.list(20).filter((item) => item.status === "FAILED").slice(0, 5)
  return { byStatus: refreshes.countByStatus(), recentFailures: recent.map((item) => ({ id: item.id, jobId: item.jobId, error: item.lastError })) }
}
