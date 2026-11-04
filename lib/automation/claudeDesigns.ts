import crypto from "node:crypto"
import {
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
export async function submitClaudeDesign(body: unknown) {
  const submission = parseDesignSubmission(body)
  const source = await downloadDesign(submission.imageUrl)
  const contentType = assertSourceAcceptedForProduct(submission.productType, sniffImageMimeType(source))
  const sha256 = crypto.createHash("sha256").update(source).digest("hex")

  const repository = new AutomationRepository()
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

export { DesignSubmissionError }
