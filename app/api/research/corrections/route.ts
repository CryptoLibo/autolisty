import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { LearningRepository, type CorrectionInput } from "@/lib/research/learning"
import { researchSchemaGate } from "@/lib/research/schemaGate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const schema = researchSchemaGate()
  if (schema) return schema
  try {
    return NextResponse.json({ corrections: new LearningRepository(getAutomationDatabase()).listCorrections() })
  } catch {
    return NextResponse.json({ error: "Learning storage is unavailable." }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const schema = researchSchemaGate()
  if (schema) return schema
  let input: CorrectionInput
  try {
    input = await request.json()
    if (!input || typeof input.text !== "string") throw new Error("Correction text is required.")
    if (input.scope !== undefined && !["general", "product", "niche", "design"].includes(input.scope)) {
      throw new Error("Invalid scope.")
    }
    if (input.scopeKey !== undefined && typeof input.scopeKey !== "string") throw new Error("Invalid scope key.")
    if (input.instruction !== undefined && typeof input.instruction !== "string") throw new Error("Invalid instruction.")
    if (input.conflictKey !== undefined && typeof input.conflictKey !== "string") throw new Error("Invalid conflict key.")
    if (input.activate !== undefined && typeof input.activate !== "boolean") throw new Error("Invalid activation choice.")
    const result = new LearningRepository(getAutomationDatabase()).createCorrection(input)
    return NextResponse.json({ ...result, needsConfirmation: result.rule.status !== "ACTIVE" }, { status: result.duplicate ? 200 : 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid correction." }, { status: 400 })
  }
}
