import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { CompanyRepository } from "@/lib/company/repository"
import { runCompanyStage } from "@/lib/company/runner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const { id } = await params
  const repository = new CompanyRepository()
  if (!repository.task(id)) return NextResponse.json({ error: "Task not found." }, { status: 404 })
  const task = await runCompanyStage(repository, id)
  return NextResponse.json({ task, budget: repository.spend() })
}
