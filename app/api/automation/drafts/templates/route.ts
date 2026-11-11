import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { AutomationRepository } from "@/lib/automation/repository"
import { PRODUCT_OPTIONS, type ProductType } from "@/lib/products"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PRODUCT_TYPES = new Set(PRODUCT_OPTIONS.map((product) => product.value))

export async function GET() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const repository = new AutomationRepository()
  return NextResponse.json({ templates: repository.getDraftTemplates(), ignored: repository.getIgnoredDrafts() })
}

// { draftIds: string[], ignore: boolean } — drafts que no son de ningún producto (p. ej. la plantilla
// antigua de phone cases): con ignore=true no se importan, no entran en el pool y no se asignan nunca.
export async function POST(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const body = await request.json().catch(() => null) as { draftIds?: unknown; ignore?: unknown } | null
  const rawIds = body?.draftIds
  const draftIds = Array.isArray(rawIds) ? rawIds.map((value: unknown) => String(value).trim()).filter(Boolean) : []
  if (draftIds.length === 0 || draftIds.length > 200 || draftIds.some((id) => !/^\d+$/.test(id))) {
    return NextResponse.json({ error: "Send one or more numeric Etsy listing IDs." }, { status: 400 })
  }
  try {
    const ignored = new AutomationRepository().setIgnoredDrafts(draftIds, body?.ignore !== false)
    return NextResponse.json({ ok: true, ignored })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update ignored drafts." }, { status: 409 })
  }
}

// { productType, draftId } — draftId vacío borra la plantilla de ese producto.
export async function PUT(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const body = await request.json().catch(() => null) as { productType?: ProductType; draftId?: string } | null
  const productType = body?.productType
  if (!productType || !PRODUCT_TYPES.has(productType)) {
    return NextResponse.json({ error: "Select a valid product type." }, { status: 400 })
  }
  const draftId = String(body?.draftId || "").trim()
  if (draftId && !/^\d+$/.test(draftId)) {
    return NextResponse.json({ error: "The template must be a numeric Etsy listing ID." }, { status: 400 })
  }
  try {
    const templates = new AutomationRepository().setDraftTemplate(productType, draftId || null)
    return NextResponse.json({ ok: true, templates })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save the template." }, { status: 409 })
  }
}
