import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { CompanyRepository } from "@/lib/company/repository"
import type { AgentId } from "@/lib/company/agents"

export const runtime = "nodejs"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const { id } = await params
  if (id !== "ceo" && id !== "market_researcher" && id !== "product_planner" && id !== "visual_designer") return NextResponse.json({ error: "Agent not found." }, { status: 404 })
  const { name, role } = new CompanyRepository().agentConfig(id as AgentId)
  return NextResponse.json({ id, name, role })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const { id } = await params
  if (id !== "ceo" && id !== "market_researcher" && id !== "product_planner" && id !== "visual_designer") return NextResponse.json({ error: "Agent not found." }, { status: 404 })
  const body = await request.json().catch(() => null) as { name?: unknown } | null
  if (typeof body?.name !== "string") return NextResponse.json({ error: "A name is required." }, { status: 400 })
  try {
    const { name, role } = new CompanyRepository().renameAgent(id as AgentId, body.name)
    return NextResponse.json({ id, name, role })
  } catch {
    return NextResponse.json({ error: "Invalid agent name." }, { status: 400 })
  }
}
