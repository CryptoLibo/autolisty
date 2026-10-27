import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { normalizeProductType } from "@/lib/products"
import { ResearchRepository } from "@/lib/research/repository"
import { researchSchemaGate } from "@/lib/research/schemaGate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const schema = researchSchemaGate()
  if (schema) return schema

  try {
    const investigations = new ResearchRepository(getAutomationDatabase()).listInvestigations()
    return NextResponse.json({ investigations })
  } catch {
    return NextResponse.json({ error: "Research storage is unavailable." }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const schema = researchSchemaGate()
  if (schema) return schema

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 })
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid investigation." }, { status: 400 })
  }
  const input = body as Record<string, unknown>
  const title = typeof input.title === "string" ? input.title.trim() : ""
  const query = typeof input.query === "string" ? input.query.trim() : ""
  if (!title || title.length > 120 || query.length > 500 || (input.mode !== "open" && input.mode !== "directed")) {
    return NextResponse.json({ error: "Title, mode, or query is invalid." }, { status: 400 })
  }
  const suggestedProductType = input.suggestedProductType == null
    ? null
    : normalizeProductType(input.suggestedProductType)
  if (suggestedProductType && suggestedProductType !== input.suggestedProductType) {
    return NextResponse.json({ error: "Invalid product type." }, { status: 400 })
  }

  try {
    const investigation = new ResearchRepository(getAutomationDatabase()).createInvestigation({
      title,
      mode: input.mode,
      query,
      suggestedProductType,
    })
    return NextResponse.json({ investigation }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Research storage is unavailable." }, { status: 500 })
  }
}
