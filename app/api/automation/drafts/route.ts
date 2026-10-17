import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { AutomationRepository } from "@/lib/automation/repository"
import { PRODUCT_OPTIONS, type ProductType } from "@/lib/products"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PRODUCT_TYPES = new Set(PRODUCT_OPTIONS.map((product) => product.value))

function normalizeDraftIds(value: unknown) {
  const rawValues = Array.isArray(value) ? value : String(value || "").split(/[\s,;]+/)
  return [...new Set(rawValues.map((item) => String(item).trim()).filter(Boolean))]
}

export async function GET() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const repository = new AutomationRepository()
  return NextResponse.json({
    drafts: repository.listDrafts(),
    summary: repository.getDraftPoolSummary(),
  })
}

export async function POST(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized

  const body = await request.json().catch(() => null) as {
    productType?: ProductType
    draftIds?: unknown
  } | null
  const productType = body?.productType
  if (!productType || !PRODUCT_TYPES.has(productType)) {
    return NextResponse.json({ error: "Select a valid product type." }, { status: 400 })
  }

  const draftIds = normalizeDraftIds(body?.draftIds)
  if (!draftIds.length) {
    return NextResponse.json({ error: "Enter at least one Etsy draft ID." }, { status: 400 })
  }
  if (draftIds.length > 500) {
    return NextResponse.json({ error: "Add no more than 500 draft IDs at once." }, { status: 400 })
  }
  const invalid = draftIds.filter((draftId) => !/^\d+$/.test(draftId))
  if (invalid.length) {
    return NextResponse.json(
      { error: `Invalid Etsy draft IDs: ${invalid.slice(0, 5).join(", ")}` },
      { status: 400 }
    )
  }

  const repository = new AutomationRepository()
  const result = repository.addDrafts(productType, draftIds)
  return NextResponse.json({ ok: true, ...result, summary: repository.getDraftPoolSummary() })
}

export async function DELETE(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized

  const body = await request.json().catch(() => null) as { draftId?: string } | null
  const draftId = String(body?.draftId || "").trim()
  if (!/^\d+$/.test(draftId)) {
    return NextResponse.json({ error: "Enter a valid Etsy draft ID." }, { status: 400 })
  }

  const repository = new AutomationRepository()
  if (!repository.removeAvailableDraft(draftId)) {
    return NextResponse.json(
      { error: "Only an available, unassigned draft can be removed." },
      { status: 409 }
    )
  }
  return NextResponse.json({ ok: true, summary: repository.getDraftPoolSummary() })
}
