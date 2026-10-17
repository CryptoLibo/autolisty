import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { AutomationRepository } from "@/lib/automation/repository"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const repository = new AutomationRepository()
  return NextResponse.json({ mode: repository.getPipelineMode() })
}

export async function PATCH(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized

  const body = await request.json().catch(() => null) as { action?: string } | null
  const repository = new AutomationRepository()

  if (body?.action === "resume") {
    return NextResponse.json({ mode: repository.resumePipeline() })
  }
  if (body?.action === "pause") {
    return NextResponse.json({ mode: repository.requestPipelinePause() })
  }

  return NextResponse.json({ error: "Use action resume or pause." }, { status: 400 })
}
