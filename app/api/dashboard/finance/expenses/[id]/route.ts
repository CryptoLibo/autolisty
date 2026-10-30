import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { FinanceValidationError, updateExpense, voidExpense, type ExpenseInput } from "@/lib/dashboard/finance"

export const runtime = "nodejs"
type Context = { params: Promise<{ id: string }> }
export async function PUT(request: Request, context: Context) {
  const unauthorized = await requireOwnerApi(); if (unauthorized) return unauthorized
  try {
    const { id } = await context.params; const body = await request.json() as ExpenseInput & { revision: number }
    return Response.json({ revision: updateExpense(getAutomationDatabase(), id, body, body.revision) })
  } catch (error) { return Response.json({ error: error instanceof FinanceValidationError ? error.message : "No se pudo editar el gasto." },
    { status: error instanceof FinanceValidationError ? 400 : 503 }) }
}
export async function DELETE(request: Request, context: Context) {
  const unauthorized = await requireOwnerApi(); if (unauthorized) return unauthorized
  try {
    const { id } = await context.params; const revision = (await request.json() as { revision: number }).revision
    voidExpense(getAutomationDatabase(), id, revision)
    return Response.json({ ok: true })
  } catch (error) { return Response.json({ error: error instanceof FinanceValidationError ? error.message : "No se pudo anular el gasto." },
    { status: error instanceof FinanceValidationError ? 400 : 503 }) }
}
