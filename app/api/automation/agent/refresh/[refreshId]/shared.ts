import { NextResponse } from "next/server"
import { requireAutomationAgent } from "@/lib/auth/automationAgent"
import { AutomationRepository } from "@/lib/automation/repository"
import { MediaRefreshRepository } from "@/lib/automation/mediaRefresh"

/** La regeneración y su listing, solo si está asignada a este agente. */
export async function loadAssignedRefresh(request: Request, refreshId: string) {
  const { agent, response } = requireAutomationAgent(request)
  if (response || !agent) return { error: response ?? NextResponse.json({ error: "Unauthorized." }, { status: 401 }) }
  const refreshes = new MediaRefreshRepository()
  const refresh = refreshes.get(refreshId)
  if (!refresh || refresh.agentId !== agent.agentId) {
    return { error: NextResponse.json({ error: "This media refresh is not assigned to the agent." }, { status: 403 }) }
  }
  const repository = new AutomationRepository()
  const job = repository.getJob(refresh.jobId)
  if (!job) return { error: NextResponse.json({ error: "Listing not found." }, { status: 404 }) }
  return { agent, refresh, refreshes, repository, job }
}
