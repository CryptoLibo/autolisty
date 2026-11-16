import { NextResponse } from "next/server"
import { MEDIA_REFRESH_MAX_ATTEMPTS } from "@/lib/automation/mediaRefresh"
import { loadAssignedRefresh } from "../shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const AGENT_STATUSES = new Set(["LOCAL_BUILDING", "LOCAL_UPLOADING", "UPLOADED", "FAILED"])

// Body: { status: LOCAL_BUILDING | LOCAL_UPLOADING | UPLOADED | FAILED, message?, error? }
export async function POST(request: Request, context: { params: Promise<{ refreshId: string }> }) {
  const { refreshId } = await context.params
  const loaded = await loadAssignedRefresh(request, refreshId)
  if ("error" in loaded) return loaded.error
  const body = await request.json().catch(() => null) as { status?: string; message?: string; error?: string } | null
  const status = String(body?.status || "")
  if (!AGENT_STATUSES.has(status)) return NextResponse.json({ error: "Invalid status." }, { status: 400 })
  const { refresh, refreshes, repository, job } = loaded
  if (!["LOCAL_BUILDING", "LOCAL_UPLOADING"].includes(refresh.status)) {
    return NextResponse.json({ error: `The media refresh is ${refresh.status}.` }, { status: 409 })
  }
  const message = body?.message ? String(body.message).slice(0, 500) : null
  const failure = body?.error ? String(body.error).slice(0, 1000) : null

  if (status === "FAILED") {
    const attempts = refresh.attempts + 1
    const final = attempts >= MEDIA_REFRESH_MAX_ATTEMPTS
    // Fallo local: vuelve a la cola para otro intento (hasta 3), luego queda fallida.
    const updated = refreshes.update(refresh.id, {
      status: final ? "FAILED" : "QUEUED",
      attempts,
      agentId: final ? refresh.agentId : null,
      lastError: failure,
      message,
    })
    repository.recordJobEvent(job.id, "WARNING", `Regeneración de medios: fallo en Automaty${final ? " (sin más intentos)" : ""}: ${(failure || "").slice(0, 300)}`)
    return NextResponse.json({ ok: true, refresh: updated })
  }

  if (status === "UPLOADED") {
    const missing = refreshes.listFiles(refresh.id).filter((file) => !file.verifiedAt)
    if (missing.length) return NextResponse.json({ error: `Unverified files: ${missing.map((file) => file.slotKey).join(", ")}` }, { status: 409 })
  }
  const updated = refreshes.update(refresh.id, { status: status as "LOCAL_BUILDING" | "LOCAL_UPLOADING" | "UPLOADED", message, nextAttemptAt: null })
  return NextResponse.json({ ok: true, refresh: updated })
}
