import { NextResponse } from "next/server"
import { requireAutomationAgent } from "@/lib/auth/automationAgent"
import { AutomationRepository } from "@/lib/automation/repository"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const { agent, response } = requireAutomationAgent(request)
  if (response || !agent) return response

  const body = await request.json().catch(() => null) as {
    name?: string
    capabilities?: unknown
  } | null
  const repository = new AutomationRepository()
  const savedAgent = repository.touchAgent({
    id: agent.agentId,
    name: String(body?.name || agent.agentId).trim().slice(0, 100),
    capabilities: body?.capabilities,
  })

  const assignedJob = savedAgent.currentJobId
    ? repository.getJob(savedAgent.currentJobId)
    : null
  const existingJob = assignedJob && [
    "LOCAL_CLAIMED",
    "LOCAL_BUILDING",
    "LOCAL_VALIDATING",
    "LOCAL_UPLOADING",
  ].includes(assignedJob.status)
    ? assignedJob
    : null
  const job = existingJob || (!assignedJob ? repository.claimNextQueuedJob(agent.agentId) : null)

  return NextResponse.json({
    ok: true,
    pipelineMode: repository.getPipelineMode(),
    job: job
      ? {
          ...job,
          files: repository.listJobFiles(job.id),
          sourceUrl: `/api/automation/agent/jobs/${job.id}/source`,
        }
      : null,
  })
}
