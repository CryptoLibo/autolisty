import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { FinanceValidationError, revertStatement } from "@/lib/dashboard/finance"

export const runtime = "nodejs"
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireOwnerApi(); if (unauthorized) return unauthorized
  try { revertStatement(getAutomationDatabase(), (await context.params).id); return Response.json({ ok: true }) }
  catch (error) { return Response.json({ error: error instanceof FinanceValidationError ? error.message : "No se pudo revertir." },
    { status: error instanceof FinanceValidationError ? 400 : 503 }) }
}
