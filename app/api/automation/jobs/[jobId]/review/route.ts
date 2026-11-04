import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { AutomationRepository } from "@/lib/automation/repository"
import { deleteAutomationSource } from "@/lib/r2/automationSources"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Aprobar o rechazar un diseño en PENDING_APPROVAL.
// Body: { decision: "approve" | "reject", note?: string }
export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const { jobId } = await context.params

  const body = (await request.json().catch(() => null)) as { decision?: unknown; note?: unknown } | null
  const decision = body?.decision
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json({ error: 'decision must be "approve" or "reject".' }, { status: 400 })
  }
  const note = typeof body?.note === "string" ? body.note : null

  const repository = new AutomationRepository()
  if (!repository.getJob(jobId)) {
    return NextResponse.json({ error: "Automation job not found." }, { status: 404 })
  }

  try {
    const job = repository.reviewJob(jobId, decision, note)
    if (decision === "reject") {
      const source = repository.listJobFiles(jobId).find((file) => file.slotKey === "source:primary")
      if (source?.r2Key && !source.deletedAt) {
        try {
          await deleteAutomationSource(source.r2Key)
          repository.markTemporarySourceDeleted(jobId)
        } catch (error) {
          console.error("Failed to delete rejected design source:", error)
        }
      }
    }
    return NextResponse.json({ ok: true, job })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to review the design."
    return NextResponse.json({ error: message }, { status: 409 })
  }
}
