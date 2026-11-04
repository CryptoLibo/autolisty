import crypto from "node:crypto"
import { NextResponse } from "next/server"
import { requireClaudeApi } from "@/lib/auth/claudeApi"
import {
  assertSourceAcceptedForProduct,
  DesignSubmissionError,
  isAllowedDesignImageUrl,
  MAX_DESIGN_SOURCE_BYTES,
  parseDesignSubmission,
  sniffImageMimeType,
} from "@/lib/automation/designIntake"
import { AutomationRepository } from "@/lib/automation/repository"
import { AUTOMATION_JOB_STATUSES, type AutomationJob, type AutomationJobStatus } from "@/lib/automation/types"
import { deleteAutomationSource, uploadAutomationSource } from "@/lib/r2/automationSources"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }

function publicJob(job: AutomationJob) {
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

// Lista los diseños enviados por Claude, con su estado y la nota de revisión.
export async function GET(request: Request) {
  const unauthorized = requireClaudeApi(request)
  if (unauthorized) return unauthorized
  const params = new URL(request.url).searchParams
  const status = params.get("status") as AutomationJobStatus | null
  if (status && !AUTOMATION_JOB_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Unknown status filter." }, { status: 400 })
  }
  const limit = Number(params.get("limit") || 100)
  const repository = new AutomationRepository()
  const jobs = repository.listJobsByOrigin("claude", { status: status || undefined, limit })
  return NextResponse.json({ designs: jobs.map(publicJob) })
}

// Recibe un diseño de Claude, guarda la fuente en R2 y lo deja pendiente de aprobación.
export async function POST(request: Request) {
  const unauthorized = requireClaudeApi(request)
  if (unauthorized) return unauthorized

  let repository: AutomationRepository | null = null
  let jobId: string | null = null
  let uploadedKey: string | null = null

  try {
    const submission = parseDesignSubmission(await request.json().catch(() => {
      throw new DesignSubmissionError("Body must be valid JSON.")
    }))
    const body = await downloadDesign(submission.imageUrl)
    const contentType = assertSourceAcceptedForProduct(submission.productType, sniffImageMimeType(body))
    const sha256 = crypto.createHash("sha256").update(body).digest("hex")

    repository = new AutomationRepository()
    const job = repository.createJob({
      productType: submission.productType,
      sourcePrompt: submission.prompt,
      origin: "claude",
      briefJson: JSON.stringify({ ...submission.brief, imageUrl: submission.imageUrl.toString() }),
    })
    jobId = job.id

    const extension = EXTENSIONS[contentType]
    uploadedKey = `production-staging/${job.productCode}/source/Design.${extension}`
    await uploadAutomationSource({ key: uploadedKey, body, contentType, sha256 })
    repository.registerTemporarySource(job.id, {
      relativePath: `Source/Design.${extension}`,
      r2Key: uploadedKey,
      contentType,
      byteSize: body.length,
      sha256,
    })
    repository.transitionJob(job.id, "SOURCE_READY", { message: "Source received from Claude and stored." })
    const pending = repository.transitionJob(job.id, "PENDING_APPROVAL", {
      message: "Design submitted by Claude; waiting for owner approval.",
    })

    return NextResponse.json({ ok: true, design: publicJob(pending) }, { status: 201 })
  } catch (error: unknown) {
    if (uploadedKey) {
      await deleteAutomationSource(uploadedKey).catch((cleanupError) =>
        console.error("Failed to clean Claude design source after intake error:", cleanupError)
      )
    }
    if (repository && jobId) {
      try {
        repository.transitionJob(jobId, "CANCELED", {
          message: "Claude design intake failed before approval.",
          error: error instanceof Error ? error.message : "Design intake failed.",
        })
      } catch (transitionError) {
        console.error("Failed to cancel incomplete Claude design:", transitionError)
      }
    }
    const message = error instanceof Error ? error.message : "Design intake failed."
    const status = error instanceof DesignSubmissionError ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
