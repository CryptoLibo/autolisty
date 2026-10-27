import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { PromptRunRepository } from "@/lib/research/promptRuns"
import { researchSchemaGate } from "@/lib/research/schemaGate"
export const runtime = "nodejs"
export async function POST(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const schema = researchSchemaGate()
  if (schema) return schema
  try {
    const body = await request.json()
    const result = new PromptRunRepository(getAutomationDatabase()).select(body.versionId, body.index)
    return Response.json({ result })
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Selection failed." }, { status: 400 }) }
}
