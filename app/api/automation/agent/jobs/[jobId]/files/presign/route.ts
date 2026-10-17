import { NextResponse } from "next/server"
import { requireAutomationAgent } from "@/lib/auth/automationAgent"
import { classifyAutomationOutput } from "@/lib/automation/outputFiles"
import { AutomationRepository } from "@/lib/automation/repository"
import { createAutomationOutputUpload } from "@/lib/r2/automationOutputs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const MAX_OUTPUT_BYTES = 500 * 1024 * 1024

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const { agent, response } = requireAutomationAgent(request)
  if (response || !agent) return response
  const { jobId } = await context.params
  const body = await request.json().catch(() => null) as {
    relativePath?: string
    contentType?: string
    byteSize?: number
    sha256?: string
  } | null
  const byteSize = Number(body?.byteSize)
  const sha256 = String(body?.sha256 || "").toLowerCase()
  const contentType = String(body?.contentType || "application/octet-stream").slice(0, 100)
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > MAX_OUTPUT_BYTES) {
    return NextResponse.json({ error: "Invalid output file size." }, { status: 400 })
  }
  if (!SHA256_PATTERN.test(sha256)) {
    return NextResponse.json({ error: "Invalid output checksum." }, { status: 400 })
  }

  const repository = new AutomationRepository()
  const job = repository.getJob(jobId)
  if (!job || job.localAgentId !== agent.agentId) {
    return NextResponse.json({ error: "This job is not assigned to the agent." }, { status: 403 })
  }
  if (job.status !== "LOCAL_UPLOADING") {
    return NextResponse.json({ error: "The job is not ready to upload outputs." }, { status: 409 })
  }

  try {
    const classified = classifyAutomationOutput({
      productType: job.productType,
      productCode: job.productCode,
      relativePath: String(body?.relativePath || ""),
    })
    repository.registerOutputUpload(jobId, {
      ...classified,
      contentType,
      byteSize,
      sha256,
    })
    const uploadUrl = await createAutomationOutputUpload({
      key: classified.r2Key,
      contentType,
      byteSize,
      sha256,
    })
    return NextResponse.json({
      ok: true,
      uploadUrl,
      slotKey: classified.slotKey,
      headers: {
        "content-type": contentType,
        "content-length": String(byteSize),
        "x-amz-meta-sha256": sha256,
        "x-amz-meta-lifecycle": "production-output",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to authorize output upload."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
