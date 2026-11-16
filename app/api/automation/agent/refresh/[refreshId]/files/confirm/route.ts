import { NextResponse } from "next/server"
import { inspectAutomationOutput } from "@/lib/r2/automationOutputs"
import { loadAssignedRefresh } from "../../shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request, context: { params: Promise<{ refreshId: string }> }) {
  const { refreshId } = await context.params
  const loaded = await loadAssignedRefresh(request, refreshId)
  if ("error" in loaded) return loaded.error
  const body = await request.json().catch(() => null) as { slotKey?: string } | null
  const slotKey = String(body?.slotKey || "")
  const file = loaded.refreshes.listFiles(loaded.refresh.id).find((candidate) => candidate.slotKey === slotKey)
  if (!file) return NextResponse.json({ error: "Output slot is not registered." }, { status: 404 })
  try {
    const object = await inspectAutomationOutput(file.r2Key)
    const remoteSize = Number(object.ContentLength || 0)
    const remoteSha256 = String(object.Metadata?.sha256 || "").toLowerCase()
    if (remoteSize !== file.byteSize || remoteSha256 !== file.sha256) {
      return NextResponse.json({ error: "R2 output verification failed." }, { status: 409 })
    }
    loaded.refreshes.verifyFile(loaded.refresh.id, slotKey)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Unable to verify refresh output:", error)
    return NextResponse.json({ error: "Unable to verify the uploaded output." }, { status: 502 })
  }
}
