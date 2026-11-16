import { NextResponse } from "next/server"
import { classifyAutomationOutput } from "@/lib/automation/outputFiles"
import { refreshR2Key, refreshSlots } from "@/lib/automation/mediaRefresh"
import { createAutomationOutputUpload } from "@/lib/r2/automationOutputs"
import type { ProductType } from "@/lib/products"
import { loadAssignedRefresh } from "../../shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const MAX_OUTPUT_BYTES = 500 * 1024 * 1024

export async function POST(request: Request, context: { params: Promise<{ refreshId: string }> }) {
  const { refreshId } = await context.params
  const loaded = await loadAssignedRefresh(request, refreshId)
  if ("error" in loaded) return loaded.error
  const { refresh, refreshes, job } = loaded
  if (refresh.status !== "LOCAL_UPLOADING") {
    return NextResponse.json({ error: "The media refresh is not ready to upload." }, { status: 409 })
  }
  const body = await request.json().catch(() => null) as { relativePath?: string; contentType?: string; byteSize?: number; sha256?: string } | null
  const byteSize = Number(body?.byteSize)
  const sha256 = String(body?.sha256 || "").toLowerCase()
  const contentType = String(body?.contentType || "application/octet-stream").slice(0, 100)
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > MAX_OUTPUT_BYTES) {
    return NextResponse.json({ error: "Invalid output file size." }, { status: 400 })
  }
  if (!SHA256_PATTERN.test(sha256)) return NextResponse.json({ error: "Invalid output checksum." }, { status: 400 })
  try {
    const classified = classifyAutomationOutput({
      productType: job.productType as ProductType,
      productCode: job.productCode,
      relativePath: String(body?.relativePath || ""),
    })
    const allowed = new Set(refreshSlots(job.productType as ProductType, refresh.scope).map((slot) => `listing:${slot}`))
    if (!allowed.has(classified.slotKey)) {
      return NextResponse.json({ error: `${classified.slotKey} is not part of this media refresh.` }, { status: 400 })
    }
    const r2Key = refreshR2Key(job.productCode, refresh.id, classified.relativePath)
    refreshes.registerFile(refresh.id, {
      slotKey: classified.slotKey,
      relativePath: classified.relativePath,
      r2Key,
      contentType,
      byteSize,
      sha256,
    })
    const uploadUrl = await createAutomationOutputUpload({ key: r2Key, contentType, byteSize, sha256 })
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to authorize upload." }, { status: 400 })
  }
}
