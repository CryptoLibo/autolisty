import { randomUUID } from "node:crypto"
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
    const body = await request.json() as { investigationId?: string; title?: string; metric?: string; value?: number; unit?: string;
      period?: string; sourceUrl?: string; note?: string }
    if (!body.investigationId || !body.title?.trim() || body.title.length > 160 ||
      !body.metric?.trim() || body.metric.length > 100 || !body.unit?.trim() || body.unit.length > 40 ||
      !body.period?.trim() || body.period.length > 100 || typeof body.value !== "number" || !Number.isFinite(body.value) ||
      !body.sourceUrl || !body.note?.trim() || body.note.length > 500) throw new Error("Complete the manual evidence, source and caveat.")
    const url = new URL(body.sourceUrl)
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) throw new Error("An HTTPS source URL is required.")
    const db = getAutomationDatabase(), repo = new MarketResearchRepository(db)
    if (!db.prepare("SELECT id FROM research_investigations WHERE id=?").get(body.investigationId)) throw new Error("Investigation not found.")
    const ids = repo.recordEvidence(body.investigationId, [{ provider: "marketplace_insights", sourceId: randomUUID(),
      sourceUrl: url.toString(), capturedAt: new Date().toISOString(), period: body.period, metric: body.metric,
      unit: body.unit, value: body.value, nature: "observed", subject: body.title,
      uncertainty: `Owner supplied; not independently verified. ${body.note}` }])
    const opportunityId = repo.addOpportunity(body.investigationId, body.title,
      `Owner-supplied marketplace observation. Source and caveat must be reviewed before use.`, ids)
    return Response.json({ opportunityId }, { status: 201 })
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Manual import failed." }, { status: 400 }) }
}
