import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { AutomationRepository } from "@/lib/automation/repository"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const { jobId } = await context.params
  const repository = new AutomationRepository()
  const job = repository.getJob(jobId)
  if (!job) return NextResponse.json({ error: "Automation job not found." }, { status: 404 })
  if ((job.status !== "NEEDS_ATTENTION" && job.status !== "RETRY_WAIT") || !job.resumeStatus) {
    return NextResponse.json({ error: "This job is not waiting for a retry." }, { status: 409 })
  }
  try {
    const updated = repository.transitionJob(jobId, job.resumeStatus, {
      message: "Manual retry requested by the owner.",
    })
    return NextResponse.json({ ok: true, job: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to retry the job."
    return NextResponse.json({ error: message }, { status: 409 })
  }
}
