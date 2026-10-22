import { NextResponse } from "next/server"
import { after } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { generationsForTask, refreshKittlGeneration, startKittlGeneration } from "@/lib/company/kittl-generation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const { id } = await params
  const rows = generationsForTask(id)
  for (const row of rows.filter((item) => ["QUEUED", "IN_PROGRESS", "READY"].includes(item.status)).slice(0, 3)) {
    try { await refreshKittlGeneration(row.id) } catch { /* Preserve the job for explicit inspection. */ }
  }
  return NextResponse.json({ generations: generationsForTask(id) })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const { id } = await params
  const body = await request.json().catch(() => null) as { conceptIndex?: number; modelId?: string } | null
  if (!Number.isInteger(body?.conceptIndex) || typeof body?.modelId !== "string" || body.modelId.length > 100) return NextResponse.json({ error: "Selecciona un concepto y modelo válidos." }, { status: 400 })
  try {
    const row = await startKittlGeneration(id, body!.conceptIndex!, body!.modelId!)
    after(async () => {
      for (let attempt = 0; attempt < 18; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 8000))
        try {
          const next = await refreshKittlGeneration(row.id)
          if (!next || !["QUEUED", "IN_PROGRESS"].includes(next.status)) break
        } catch { break }
      }
    })
    return NextResponse.json({ generation: row }, { status: 202 })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo generar." }, { status: 409 }) }
}
