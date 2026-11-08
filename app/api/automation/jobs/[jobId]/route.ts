import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { AutomationRepository } from "@/lib/automation/repository"
import { deleteAutomationSource } from "@/lib/r2/automationSources"
import { discardJob, restartClaudeDesignJob } from "@/lib/automation/claudeDesigns"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Acciones del propietario sobre un diseño que aún no empezó en Automaty.
// Body: { action: "cancel", reason?: string } | { action: "priority", priority: number }
//     | { action: "discard" }  (incidencia: cancelar y borrar todo de R2)
//     | { action: "restart" }  (incidencia: descartar y volver a empezar con código nuevo)
//     | { action: "allow_claude_edit" } (24 h) | { action: "revoke_claude_edit" }
export async function PATCH(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const { jobId } = await context.params
  const body = (await request.json().catch(() => null)) as { action?: unknown; reason?: unknown; priority?: unknown } | null

  const repository = new AutomationRepository()
  if (!repository.getJob(jobId)) return NextResponse.json({ error: "Automation job not found." }, { status: 404 })

  try {
    if (body?.action === "priority") {
      const priority = Number(body.priority)
      if (!Number.isFinite(priority)) return NextResponse.json({ error: "priority must be a number." }, { status: 400 })
      return NextResponse.json({ ok: true, job: repository.setJobPriority(jobId, priority) })
    }
    if (body?.action === "cancel") {
      const job = repository.cancelQueuedJob(jobId, typeof body.reason === "string" ? body.reason : null)
      const source = repository.listJobFiles(jobId).find((file) => file.slotKey === "source:primary")
      if (source?.r2Key && source.status !== "DELETED") {
        try {
          await deleteAutomationSource(source.r2Key)
          repository.markTemporarySourceDeleted(jobId)
        } catch (error) {
          console.error("Failed to delete canceled design source:", error)
        }
      }
      return NextResponse.json({ ok: true, job })
    }
    if (body?.action === "allow_claude_edit") {
      const until = new Date(Date.now() + 24 * 60 * 60_000).toISOString()
      return NextResponse.json({ ok: true, job: repository.setClaudeEditPermission(jobId, until) })
    }
    if (body?.action === "revoke_claude_edit") {
      return NextResponse.json({ ok: true, job: repository.setClaudeEditPermission(jobId, null) })
    }
    if (body?.action === "discard") {
      return NextResponse.json({ ok: true, job: await discardJob(jobId, "Discarded by the owner; files deleted.") })
    }
    if (body?.action === "restart") {
      return NextResponse.json({ ok: true, ...(await restartClaudeDesignJob(jobId)) })
    }
    return NextResponse.json({ error: 'action must be "cancel", "priority", "discard" or "restart".' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update the design." }, { status: 409 })
  }
}
