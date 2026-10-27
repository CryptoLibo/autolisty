import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { normalizeProductType } from "@/lib/products"
import { LearningRepository, type ApplicableContext } from "@/lib/research/learning"
import { researchSchemaGate } from "@/lib/research/schemaGate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const schema = researchSchemaGate()
  if (schema) return schema
  try {
    const body = await request.json() as ApplicableContext & { maxMemoryTokens?: number }
    if (!body || typeof body !== "object") throw new Error("Invalid context.")
    if (body.productType && normalizeProductType(body.productType) !== body.productType) throw new Error("Invalid product type.")
    for (const value of [body.niche, body.investigationId, body.conceptId, body.designId]) {
      if (value !== undefined && value !== null && (typeof value !== "string" || value.length > 200)) throw new Error("Invalid context field.")
    }
    const result = new LearningRepository(getAutomationDatabase()).getApplicableRules(body, { maxMemoryTokens: body.maxMemoryTokens })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read rules." }, { status: 400 })
  }
}
