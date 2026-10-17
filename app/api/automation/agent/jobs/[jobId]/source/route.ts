import { NextResponse } from "next/server"
import { requireAutomationAgent } from "@/lib/auth/automationAgent"
import { AutomationRepository } from "@/lib/automation/repository"
import { getAutomationSource } from "@/lib/r2/automationSources"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const { agent, response } = requireAutomationAgent(request)
  if (response || !agent) return response

  const { jobId } = await context.params
  const repository = new AutomationRepository()
  const job = repository.getJob(jobId)
  if (!job || job.localAgentId !== agent.agentId) {
    return NextResponse.json({ error: "This job is not assigned to the agent." }, { status: 403 })
  }

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
        "Content-Disposition": `attachment; filename="${source.relativePath.split("/").pop() || "Design"}"`,
        "Cache-Control": "no-store",
        "X-Source-SHA256": source.sha256 || "",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    console.error("Unable to stream source to automation agent:", error)
    return NextResponse.json({ error: "Unable to download the source design." }, { status: 502 })
  }
}
