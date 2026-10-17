import crypto from "node:crypto"
import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { getProductionProductContract } from "@/lib/automation/productContracts"
import { AutomationRepository } from "@/lib/automation/repository"
import { PRODUCT_OPTIONS, type ProductType } from "@/lib/products"
import {
  deleteAutomationSource,
  uploadAutomationSource,
} from "@/lib/r2/automationSources"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_SOURCE_BYTES = 100 * 1024 * 1024
const PRODUCT_TYPES = new Set(PRODUCT_OPTIONS.map((product) => product.value))

function sourceExtension(contentType: string) {
  if (contentType === "image/png") return "png"
  if (contentType === "image/jpeg") return "jpg"
  if (contentType === "image/webp") return "webp"
  return "bin"
}

export async function GET() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized

  const repository = new AutomationRepository()
  const jobs = repository.listJobs(200).map((job) => ({
    ...job,
    files: repository.listJobFiles(job.id),
    sourcePreviewUrl: `/api/automation/jobs/${job.id}/source`,
  }))

  return NextResponse.json({
    jobs,
    pipelineMode: repository.getPipelineMode(),
    jobsByStatus: repository.countByStatus(),
  })
}

export async function POST(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized

  let repository: AutomationRepository | null = null
  let jobId: string | null = null
  let uploadedKey: string | null = null

  try {
    const formData = await request.formData()
    const productType = String(formData.get("productType") || "") as ProductType
    const sourcePrompt = String(formData.get("sourcePrompt") || "").trim()
    const sourceFile = formData.get("sourceFile")

    if (!PRODUCT_TYPES.has(productType)) {
      return NextResponse.json({ error: "Select a valid product type." }, { status: 400 })
    }
    if (!sourcePrompt) {
      return NextResponse.json({ error: "The design prompt is required." }, { status: 400 })
    }
    if (!(sourceFile instanceof File) || sourceFile.size === 0) {
      return NextResponse.json({ error: "Select the final source design." }, { status: 400 })
    }

    const contract = getProductionProductContract(productType)
    if (!contract.source.acceptedMimeTypes.includes(sourceFile.type)) {
      return NextResponse.json(
        { error: `Unsupported source format for ${contract.label}.` },
        { status: 400 }
      )
    }
    if (sourceFile.size > MAX_SOURCE_BYTES) {
      return NextResponse.json(
        { error: "The source design exceeds the 100 MB intake limit." },
        { status: 413 }
      )
    }

    repository = new AutomationRepository()
    const job = repository.createJob({ productType, sourcePrompt })
    jobId = job.id

    const extension = sourceExtension(sourceFile.type)
    const relativePath = `Source/Design.${extension}`
    uploadedKey = `production-staging/${job.productCode}/source/Design.${extension}`
    const body = Buffer.from(await sourceFile.arrayBuffer())
    const sha256 = crypto.createHash("sha256").update(body).digest("hex")

    await uploadAutomationSource({
      key: uploadedKey,
      body,
      contentType: sourceFile.type,
      sha256,
    })

    repository.registerTemporarySource(job.id, {
      relativePath,
      r2Key: uploadedKey,
      contentType: sourceFile.type,
      byteSize: sourceFile.size,
      sha256,
    })
    repository.transitionJob(job.id, "SOURCE_READY", {
      message: "Source uploaded and registered for local production.",
    })
    const queuedJob = repository.transitionJob(job.id, "QUEUED_LOCAL", {
      message: "Job added to the local production queue.",
    })

    return NextResponse.json({
      ok: true,
      job: queuedJob,
      sourcePreviewUrl: `/api/automation/jobs/${job.id}/source`,
    })
  } catch (error: unknown) {
    if (uploadedKey) {
      try {
        await deleteAutomationSource(uploadedKey)
      } catch (cleanupError) {
        console.error("Failed to clean automation source after intake error:", cleanupError)
      }
    }
    if (repository && jobId) {
      try {
        repository.transitionJob(jobId, "CANCELED", {
          message: "Intake failed before the job entered production.",
          error: error instanceof Error ? error.message : "Automation intake failed.",
        })
      } catch (transitionError) {
        console.error("Failed to cancel incomplete automation job:", transitionError)
      }
    }

    const message = error instanceof Error ? error.message : "Automation intake failed."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
