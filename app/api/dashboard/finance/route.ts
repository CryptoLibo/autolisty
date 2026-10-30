import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { createExpense, financeSnapshot, FinanceValidationError, FINANCE_PERIODS, type ExpenseInput } from "@/lib/dashboard/finance"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const unauthorized = await requireOwnerApi(); if (unauthorized) return unauthorized
  const params = new URL(request.url).searchParams
  const period = params.get("period") ?? "30d"
  if (!FINANCE_PERIODS.some((item) => item === period)) return Response.json({ error: "Periodo inválido." }, { status: 400 })
  try { return Response.json(financeSnapshot(getAutomationDatabase(), period as "7d" | "30d" | "90d", params.get("category") ?? "", params.get("provider") ?? ""),
    { headers: { "Cache-Control": "private, no-store" } }) }
  catch { return Response.json({ error: "No se pudieron leer los datos financieros." }, { status: 503 }) }
}
export async function POST(request: Request) {
  const unauthorized = await requireOwnerApi(); if (unauthorized) return unauthorized
  try {
    const input = await request.json() as ExpenseInput
    const id = createExpense(getAutomationDatabase(), input)
    return Response.json({ id }, { status: 201 })
  } catch (error) { return Response.json({ error: error instanceof FinanceValidationError ? error.message : "No se pudo guardar el gasto." },
    { status: error instanceof FinanceValidationError ? 400 : 503 }) }
}
