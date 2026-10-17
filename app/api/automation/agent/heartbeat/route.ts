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
  const name = String(body?.name || agent.agentId).trim().slice(0, 100)
  const repository = new AutomationRepository()
  const savedAgent = repository.touchAgent({
    id: agent.agentId,
    name,
    capabilities: body?.capabilities,
  })
  repository.renewAgentLease(agent.agentId)

  return NextResponse.json({
    ok: true,
    agent: savedAgent,
    pipelineMode: repository.getPipelineMode(),
    currentJob: savedAgent.currentJobId
      ? repository.getJob(savedAgent.currentJobId)
      : null,
  })
}
