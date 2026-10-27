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
    const body = await request.json() as { opportunityIds?: string[]; selected?: boolean }
    if (!Array.isArray(body.opportunityIds) || body.opportunityIds.length > 20 ||
      body.opportunityIds.some((id) => typeof id !== "string") || typeof body.selected !== "boolean") throw new Error("Invalid selection.")
    const repo = new MarketResearchRepository(getAutomationDatabase())
    for (const id of body.opportunityIds) repo.selectOpportunity(id, body.selected)
    return Response.json({ selected: body.opportunityIds })
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Selection failed." }, { status: 400 }) }
}
