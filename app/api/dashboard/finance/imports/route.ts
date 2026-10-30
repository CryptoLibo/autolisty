import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { FinanceValidationError, importStatement, previewStatement } from "@/lib/dashboard/finance"

export const runtime = "nodejs"
export async function POST(request: Request) {
  const unauthorized = await requireOwnerApi(); if (unauthorized) return unauthorized
  try {
    const body = await request.json() as { content: string; filename: string; expectedHash?: string }
    if (typeof body.content !== "string" || typeof body.filename !== "string") throw new FinanceValidationError("Archivo inválido.")
    if (!body.expectedHash) {
      const preview = previewStatement(body.content)
      return Response.json({ fileHash: preview.fileHash, total: preview.total, accepted: preview.accepted.length,
        rejected: preview.rejected, breakdown: Object.entries(Object.groupBy(preview.accepted, (item) => item.type))
          .map(([type, rows]) => ({ type, count: rows?.length ?? 0 })) })
    }
    return Response.json(importStatement(getAutomationDatabase(), body.content, body.filename, body.expectedHash))
  } catch (error) { return Response.json({ error: error instanceof FinanceValidationError ? error.message : "No se pudo leer el CSV." },
    { status: error instanceof FinanceValidationError ? 400 : 503 }) }
}
