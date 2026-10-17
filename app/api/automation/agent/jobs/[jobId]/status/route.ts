import { NextResponse } from "next/server"
import { requireAutomationAgent } from "@/lib/auth/automationAgent"
import { AutomationRepository } from "@/lib/automation/repository"
import { validateAutomationOutputFiles } from "@/lib/automation/outputFiles"
import { deleteAutomationSource } from "@/lib/r2/automationSources"
import type { AutomationJobStatus } from "@/lib/automation/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ALLOWED_AGENT_STATUSES = new Set<AutomationJobStatus>([
  "LOCAL_BUILDING",
  "LOCAL_VALIDATING",
  "LOCAL_UPLOADING",
  "LOCAL_COMPLETE",
  "RETRY_WAIT",
  "NEEDS_ATTENTION",
])

export async function PATCH(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const { agent, response } = requireAutomationAgent(request)
  if (response || !agent) return response

  const { jobId } = await context.params
  const body = await request.json().catch(() => null) as {
    status?: AutomationJobStatus
    message?: string
    error?: string
  } | null
  const nextStatus = body?.status
  if (!nextStatus || !ALLOWED_AGENT_STATUSES.has(nextStatus)) {
    return NextResponse.json({ error: "Invalid local production status." }, { status: 400 })
  }

  const repository = new AutomationRepository()
  const current = repository.getJob(jobId)
  if (!current || current.localAgentId !== agent.agentId) {
    return NextResponse.json({ error: "This job is not assigned to the agent." }, { status: 403 })
  }

  try {
    if (nextStatus === "LOCAL_BUILDING") {
      const source = repository
        .listJobFiles(jobId)
        .find((file) => file.slotKey === "source:primary")
      if (source?.status === "UPLOADED") repository.verifyTemporarySource(jobId)
    }

    if (nextStatus === "LOCAL_COMPLETE") {
      validateAutomationOutputFiles(current.productType, repository.listJobFiles(jobId))
      const source = repository
        .listJobFiles(jobId)
        .find((file) => file.slotKey === "source:primary")
      if (source?.r2Key && source.status !== "DELETED") {
        await deleteAutomationSource(source.r2Key)
        repository.markTemporarySourceDeleted(jobId)
      }
    }

    const isFailure = nextStatus === "RETRY_WAIT" || nextStatus === "NEEDS_ATTENTION"
    const updated = repository.transitionJob(jobId, nextStatus, {
      message: String(body?.message || "").trim().slice(0, 500) || undefined,
      error: isFailure
        ? String(body?.error || "Local production failed.").trim().slice(0, 2000)
        : null,
      resumeStatus: isFailure ? current.status : undefined,
    })

    if (nextStatus === "LOCAL_COMPLETE") {
      repository.setAgentCurrentJob(agent.agentId, null)
    } else {
      repository.renewAgentLease(agent.agentId)
    }

    return NextResponse.json({ ok: true, job: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update job status."
    return NextResponse.json({ error: message }, { status: 409 })
  }
}
