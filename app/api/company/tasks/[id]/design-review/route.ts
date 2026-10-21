import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { CompanyRepository } from "@/lib/company/repository"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const { id } = await params
  const body = await request.json().catch(() => null) as { conceptIndex?: number; verdict?: string; notes?: string; kittlUrl?: string } | null
  const notes = body?.notes?.trim() || ""
  const url = body?.kittlUrl?.trim() || ""
  if (!Number.isInteger(body?.conceptIndex) || !["approved", "revise"].includes(body?.verdict || "") || notes.length > 1500 || url.length > 1000) {
    return NextResponse.json({ error: "Invalid design review." }, { status: 400 })
  }
  if (url) {
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== "https:" || !["kittl.com", "www.kittl.com"].includes(parsed.hostname)) throw new Error()
    } catch { return NextResponse.json({ error: "Use an HTTPS Kittl link." }, { status: 400 }) }
  }
  if (body?.verdict === "revise" && !notes) return NextResponse.json({ error: "Describe what needs revision." }, { status: 400 })
  try {
    const reviews = new CompanyRepository().saveDesignReview(id, body!.conceptIndex!, body!.verdict as "approved" | "revise", notes, url || null)
    return NextResponse.json({ reviews })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cannot save review." }, { status: 409 })
  }
}
