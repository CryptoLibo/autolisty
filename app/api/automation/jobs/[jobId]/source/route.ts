import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { AutomationRepository } from "@/lib/automation/repository"
import { getAutomationSource } from "@/lib/r2/automationSources"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized

  const { jobId } = await context.params
  const repository = new AutomationRepository()
  const source = repository
    .listJobFiles(jobId)
    .find((file) => file.slotKey === "source:primary")

  if (!source?.r2Key || source.status === "DELETED") {
    return NextResponse.json({ error: "Source design is not available." }, { status: 404 })
  }

  try {
    const object = await getAutomationSource(source.r2Key)
    if (!object.Body) {
      return NextResponse.json({ error: "Source design is empty." }, { status: 404 })
    }

    const bytes = await object.Body.transformToByteArray()
    const responseBody = new Uint8Array(bytes.byteLength)
    responseBody.set(bytes)
    return new Response(responseBody.buffer, {
      headers: {
        "Content-Type": source.contentType || object.ContentType || "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    console.error("Unable to read automation source:", error)
    return NextResponse.json({ error: "Unable to load the source design." }, { status: 502 })
  }
}
