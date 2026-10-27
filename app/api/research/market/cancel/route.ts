import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { MarketResearchRepository } from "@/lib/research/market/repository"
import { researchSchemaGate } from "@/lib/research/schemaGate"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const schema = researchSchemaGate()
  if (schema) return schema
  try {
    const body = await request.json() as { runId?: unknown }
    if (typeof body.runId !== "string" || !body.runId) return Response.json({ error: "Invalid run ID." }, { status: 400 })
    const state = new MarketResearchRepository(getAutomationDatabase()).cancel(body.runId)
    return Response.json({ state })
  } catch {
    return Response.json({ error: "Research cancellation failed." }, { status: 400 })
  }
}
