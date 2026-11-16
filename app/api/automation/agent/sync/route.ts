import { NextResponse } from "next/server"
import { requireAutomationAgent } from "@/lib/auth/automationAgent"
import { AutomationRepository } from "@/lib/automation/repository"
import { MediaRefreshRepository, refreshSlots } from "@/lib/automation/mediaRefresh"
import type { ProductType } from "@/lib/products"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Sincronización de la cola local de Automaty (al encender y cada pocos minutos).
// Body: { name?, capabilities?, cleanedJobIds?: string[] }
// Respuesta: modo de producción, cola local completa (con datos de la fuente) y
// listings terminados/cancelados cuya carpeta local Automaty debe borrar.
export async function POST(request: Request) {
  const { agent, response } = requireAutomationAgent(request)
  if (response || !agent) return response

  const body = (await request.json().catch(() => null)) as {
    name?: string
    capabilities?: unknown
    cleanedJobIds?: unknown
  } | null
  const cleanedJobIds = Array.isArray(body?.cleanedJobIds)
    ? body!.cleanedJobIds.filter((id): id is string => typeof id === "string" && id.length <= 64)
    : []

  const repository = new AutomationRepository()
  repository.touchAgent({
    id: agent.agentId,
    name: String(body?.name || agent.agentId).trim().slice(0, 100),
    capabilities: body?.capabilities,
  })
  const result = repository.syncAgentQueue(agent.agentId, { cleanedJobIds })
  // Regenerar medios solo cuando no hay listings nuevos que producir.
  const refreshes = new MediaRefreshRepository()
  const refresh = result.queue.length === 0 ? refreshes.claimForAgent(agent.agentId) : null
  const refreshJob = refresh ? repository.getJob(refresh.jobId) : null

  return NextResponse.json({
    ok: true,
    pipelineMode: result.pipelineMode,
    queue: result.queue.map((job) => ({
      id: job.id,
      productCode: job.productCode,
      productType: job.productType,
      status: job.status,
      priority: job.priority,
      files: repository.listJobFiles(job.id).filter((file) => file.slotKey === "source:primary"),
      sourceUrl: `/api/automation/agent/jobs/${job.id}/source`,
    })),
    cleanup: result.cleanup.map((job) => ({ id: job.id, productCode: job.productCode, status: job.status })),
    newlySynced: result.assignedNow.length,
    refresh: refresh && refreshJob
      ? {
          id: refresh.id,
          status: refresh.status,
          scope: refresh.scope,
          jobId: refreshJob.id,
          productCode: refreshJob.productCode,
          productType: refreshJob.productType,
          slots: refreshSlots(refreshJob.productType as ProductType, refresh.scope),
          sourceUrl: `/api/automation/agent/refresh/${refresh.id}/source`,
        }
      : null,
  })
}
