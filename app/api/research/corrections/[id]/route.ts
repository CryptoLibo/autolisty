import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { LearningRepository, type RuleScope, type RuleStatus } from "@/lib/research/learning"
import { researchSchemaGate } from "@/lib/research/schemaGate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: Context) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const schema = researchSchemaGate()
  if (schema) return schema
  const { id } = await context.params
  return NextResponse.json({ history: new LearningRepository(getAutomationDatabase()).getHistory(id) })
}

export async function PATCH(request: Request, context: Context) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const schema = researchSchemaGate()
  if (schema) return schema
  const { id } = await context.params
  try {
    const input = await request.json() as {
      expectedVersion: number; text?: string; instruction?: string; scope?: RuleScope;
      scopeKey?: string; conflictKey?: string; priority?: number; status?: RuleStatus
    }
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) throw new Error("Expected version is required.")
    if (input.scope !== undefined && !["general", "product", "niche", "design"].includes(input.scope)) throw new Error("Invalid scope.")
    if (input.status !== undefined && !["PROPOSED", "ACTIVE", "INACTIVE"].includes(input.status)) throw new Error("Invalid status.")
    for (const field of [input.text, input.instruction, input.scopeKey, input.conflictKey]) {
      if (field !== undefined && typeof field !== "string") throw new Error("Invalid correction field.")
    }
    const result = new LearningRepository(getAutomationDatabase()).updateCorrection(id, input)
    return NextResponse.json({ ...result, needsConfirmation: result.rule.status !== "ACTIVE" })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update correction."
    const status = message === "Correction not found." ? 404 : message.includes("reload") ? 409 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
