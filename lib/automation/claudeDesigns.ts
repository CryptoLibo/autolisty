import crypto from "node:crypto"
import {
  assertPngDesignReady,
  assertSourceAcceptedForProduct,
  DesignSubmissionError,
  isAllowedDesignImageUrl,
  MAX_DESIGN_SOURCE_BYTES,
  parseDesignSubmission,
  sniffImageMimeType,
} from "./designIntake"
import { AutomationRepository } from "./repository"
import { AUTOMATION_JOB_STATUSES, type AutomationJob, type AutomationJobStatus } from "./types"
import { deleteAutomationSource, uploadAutomationSource } from "../r2/automationSources"
import { deleteListingAssets } from "../r2/deleteListingAssets"

// Lógica compartida por la API REST (/api/claude/designs) y el conector MCP (/api/mcp).

const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }

export type ClaudeDesignView = ReturnType<typeof toClaudeDesignView>

export function toClaudeDesignView(job: AutomationJob) {
  let brief: unknown = null
  try {
    brief = job.briefJson ? JSON.parse(job.briefJson) : null
  } catch {
    brief = null
  }
  return {
    id: job.id,
    productCode: job.productCode,
    productType: job.productType,
    status: job.status,
    prompt: job.sourcePrompt,
    brief,
    reviewNote: job.reviewNote,
    reviewedAt: job.reviewedAt,
    lastError: job.lastError,
    etsyUrl: job.etsyUrl,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }
}

async function downloadDesign(url: URL) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(60_000) })
  if (!isAllowedDesignImageUrl(new URL(response.url))) {
    throw new DesignSubmissionError("The image URL redirected outside kittl.com.")
  }
  if (!response.ok) throw new DesignSubmissionError(`Could not download the image (HTTP ${response.status}).`)
  const declaredLength = Number(response.headers.get("content-length") || 0)
  if (declaredLength > MAX_DESIGN_SOURCE_BYTES) throw new DesignSubmissionError("The image exceeds 100 MB.")
  const body = Buffer.from(await response.arrayBuffer())
  if (body.length === 0) throw new DesignSubmissionError("The image is empty.")
  if (body.length > MAX_DESIGN_SOURCE_BYTES) throw new DesignSubmissionError("The image exceeds 100 MB.")
  return body
}

export function listClaudeDesigns(options: { status?: string | null; limit?: number } = {}) {
  const status = options.status || undefined
  if (status && !AUTOMATION_JOB_STATUSES.includes(status as AutomationJobStatus)) {
    throw new DesignSubmissionError(`Unknown status filter "${status}".`)
  }
  const repository = new AutomationRepository()
  return repository
    .listJobsByOrigin("claude", { status: status as AutomationJobStatus | undefined, limit: options.limit ?? 100 })
    .map(toClaudeDesignView)
}

// Descarga la imagen de Kittl, la guarda en R2 y deja el job en PENDING_APPROVAL.
export async function submitClaudeDesign(body: unknown, options: { replacesJobId?: string } = {}) {
  const submission = parseDesignSubmission(body)
  const source = await downloadDesign(submission.imageUrl)
  const contentType = assertSourceAcceptedForProduct(submission.productType, sniffImageMimeType(source))
  assertPngDesignReady(submission.productType, source)
  const sha256 = crypto.createHash("sha256").update(source).digest("hex")

  const repository = new AutomationRepository()
  // Misma imagen ya enviada (p. ej. un reintento tras un corte): se devuelve la existente.
  const existing = repository.findActiveJobBySourceHash(sha256, options.replacesJobId ?? null)
  if (existing) return { ...toClaudeDesignView(existing), duplicate: true as const }

  const job = repository.createJob({
    productType: submission.productType,
    sourcePrompt: submission.prompt,
    origin: "claude",
    briefJson: JSON.stringify({ ...submission.brief, imageUrl: submission.imageUrl.toString() }),
  })

  let uploadedKey: string | null = null
  try {
    const extension = EXTENSIONS[contentType]
    uploadedKey = `production-staging/${job.productCode}/source/Design.${extension}`
    await uploadAutomationSource({ key: uploadedKey, body: source, contentType, sha256 })
    repository.registerTemporarySource(job.id, {
      relativePath: `Source/Design.${extension}`,
      r2Key: uploadedKey,
      contentType,
      byteSize: source.length,
      sha256,
    })
    repository.transitionJob(job.id, "SOURCE_READY", { message: "Source received from Claude and stored." })
    const pending = repository.transitionJob(job.id, "PENDING_APPROVAL", {
      message: "Design submitted by Claude; waiting for owner approval.",
    })
    return toClaudeDesignView(pending)
  } catch (error) {
    if (uploadedKey) {
      await deleteAutomationSource(uploadedKey).catch((cleanupError) =>
        console.error("Failed to clean Claude design source after intake error:", cleanupError)
      )
    }
    try {
      repository.transitionJob(job.id, "CANCELED", {
        message: "Claude design intake failed before approval.",
        error: error instanceof Error ? error.message : "Design intake failed.",
      })
    } catch (transitionError) {
      console.error("Failed to cancel incomplete Claude design:", transitionError)
    }
    throw error
  }
}

const DISCARDABLE_STATUSES = new Set<AutomationJobStatus>(["NEEDS_ATTENTION", "RETRY_WAIT"])

/**
 * Descarta un trabajo con incidencias: lo cancela, devuelve su draft de Etsy al
 * pool y borra de R2 todo lo que se generó con su código (mockups, pines,
 * entregables, PDF y fuente). Automaty borra su carpeta local al sincronizar.
 * Nunca se aplica a un listing ya publicado: sus entregables los usan los compradores.
 */
export async function discardJob(jobId: string, reason: string) {
  const repository = new AutomationRepository()
  const job = repository.getJob(jobId)
  if (!job) throw new DesignSubmissionError("Automation job not found.")
  if (!DISCARDABLE_STATUSES.has(job.status)) {
    throw new DesignSubmissionError("Only designs with an incident can be discarded.")
  }
  if (job.etsyState === "active" || job.etsyUrl) {
    throw new DesignSubmissionError("This listing is already published on Etsy; its files cannot be deleted from here.")
  }
  const canceled = repository.cancelQueuedJob(jobId, reason)
  const source = repository.listJobFiles(jobId).find((file) => file.slotKey === "source:primary")
  if (source?.r2Key && source.status !== "DELETED") {
    await deleteAutomationSource(source.r2Key).catch((error) => console.error("Failed to delete source:", error))
  }
  await deleteListingAssets(job.productCode)
  repository.markAllFilesDeleted(jobId)
  repository.recordJobEvent(jobId, "FILES_DELETED", "Archivos del listing borrados de R2.")
  return canceled
}

/**
 * Vuelve a empezar un diseño de Claude con incidencias: crea uno nuevo (código
 * nuevo) desde la misma imagen de Kittl y la misma investigación, ya aprobado,
 * y después descarta el anterior. Si la imagen ya no se puede descargar, no se
 * toca el trabajo anterior.
 */
export async function restartClaudeDesignJob(jobId: string) {
  const repository = new AutomationRepository()
  const job = repository.getJob(jobId)
  if (!job) throw new DesignSubmissionError("Automation job not found.")
  if (!DISCARDABLE_STATUSES.has(job.status)) {
    throw new DesignSubmissionError("Only designs with an incident can be restarted.")
  }
  const brief = job.briefJson ? JSON.parse(job.briefJson) as Record<string, unknown> & { kittl?: Record<string, unknown> } : null
  if (!brief?.imageUrl) throw new DesignSubmissionError("This design has no original Kittl image to start again from.")

  const restarted = await submitClaudeDesign({
    productType: job.productType,
    prompt: job.sourcePrompt,
    imageUrl: brief.imageUrl,
    primaryKeyword: brief.primaryKeyword ?? undefined,
    secondaryKeywords: brief.secondaryKeywords ?? undefined,
    collection: brief.collection ?? undefined,
    cropAnchor: brief.cropAnchor ?? undefined,
    rationale: brief.rationale ?? undefined,
    tagCandidates: brief.tagCandidates ?? undefined,
    competitorListings: brief.competitorListings ?? undefined,
    kittl: brief.kittl ?? undefined,
    researchSource: brief.researchSource ?? undefined,
  }, { replacesJobId: job.id })
  await discardJob(jobId, `Restarted as ${restarted.productCode}.`)
  const approved = repository.reviewJob(restarted.id, "approve", `Restart of ${job.productCode}.`)
  return { previous: job.productCode, job: approved }
}

export { DesignSubmissionError }
