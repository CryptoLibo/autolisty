import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { FinanceValidationError, reconcileExpense, undoReconciliation } from "@/lib/dashboard/finance"

export const runtime = "nodejs"
export async function POST(request: Request) {
  const unauthorized = await requireOwnerApi(); if (unauthorized) return unauthorized
  try { const body = await request.json() as { expenseId: string; rowId: string }
    reconcileExpense(getAutomationDatabase(), body.expenseId, body.rowId); return Response.json({ ok: true }) }
  catch (error) { return Response.json({ error: error instanceof FinanceValidationError ? error.message : "No se pudo conciliar." },
    { status: error instanceof FinanceValidationError ? 400 : 503 }) }
}
export async function DELETE(request: Request) {
  const unauthorized = await requireOwnerApi(); if (unauthorized) return unauthorized
  try { undoReconciliation(getAutomationDatabase(), (await request.json() as { id: string }).id); return Response.json({ ok: true }) }
  catch (error) { return Response.json({ error: error instanceof FinanceValidationError ? error.message : "No se pudo deshacer." },
    { status: error instanceof FinanceValidationError ? 400 : 503 }) }
}
