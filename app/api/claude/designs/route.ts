import { NextResponse } from "next/server"
import { requireClaudeApi } from "@/lib/auth/claudeApi"
import { DesignSubmissionError, listClaudeDesigns, submitClaudeDesign } from "@/lib/automation/claudeDesigns"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Lista los diseños enviados por Claude, con su estado y la nota de revisión.
export async function GET(request: Request) {
  const unauthorized = requireClaudeApi(request)
  if (unauthorized) return unauthorized
  const params = new URL(request.url).searchParams
  try {
    const designs = listClaudeDesigns({ status: params.get("status"), limit: Number(params.get("limit") || 100) })
    return NextResponse.json({ designs })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list designs."
    return NextResponse.json({ error: message }, { status: error instanceof DesignSubmissionError ? 400 : 500 })
  }
}

// Recibe un diseño de Claude, guarda la fuente en R2 y lo deja pendiente de aprobación.
export async function POST(request: Request) {
  const unauthorized = requireClaudeApi(request)
  if (unauthorized) return unauthorized
  try {
    const body = await request.json().catch(() => {
      throw new DesignSubmissionError("Body must be valid JSON.")
    })
    const design = await submitClaudeDesign(body)
    return NextResponse.json({ ok: true, design }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Design intake failed."
    return NextResponse.json({ error: message }, { status: error instanceof DesignSubmissionError ? 400 : 500 })
  }
}
