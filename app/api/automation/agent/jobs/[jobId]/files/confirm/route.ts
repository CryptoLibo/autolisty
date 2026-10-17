import { NextResponse } from "next/server"
import { requireAutomationAgent } from "@/lib/auth/automationAgent"
import { AutomationRepository } from "@/lib/automation/repository"
import { inspectAutomationOutput } from "@/lib/r2/automationOutputs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const { agent, response } = requireAutomationAgent(request)
  if (response || !agent) return response
  const { jobId } = await context.params
  const body = await request.json().catch(() => null) as { slotKey?: string } | null
  const slotKey = String(body?.slotKey || "")
  const repository = new AutomationRepository()
  const job = repository.getJob(jobId)
  if (!job || job.localAgentId !== agent.agentId) {
    return NextResponse.json({ error: "This job is not assigned to the agent." }, { status: 403 })
  }
  const file = repository.listJobFiles(jobId).find((candidate) => candidate.slotKey === slotKey)
  if (!file?.r2Key || !file.sha256 || !file.byteSize) {
    return NextResponse.json({ error: "Output slot is not registered." }, { status: 404 })
  }

  try {
    const object = await inspectAutomationOutput(file.r2Key)
    const remoteSize = Number(object.ContentLength || 0)
    const remoteSha256 = String(object.Metadata?.sha256 || "").toLowerCase()
    if (remoteSize !== file.byteSize || remoteSha256 !== file.sha256) {
      return NextResponse.json({ error: "R2 output verification failed." }, { status: 409 })
    }
    const verified = repository.verifyOutputUpload(jobId, slotKey)
    return NextResponse.json({ ok: true, file: verified })
  } catch (error) {
    console.error("Unable to verify automation output:", error)
    return NextResponse.json({ error: "Unable to verify the uploaded output." }, { status: 502 })
  }
}
