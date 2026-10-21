import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { CompanyRepository } from "@/lib/company/repository"
import { AutomationRepository } from "@/lib/automation/repository"
import { COMPANY_ROLES } from "@/lib/company/roles"
import { kittlConnectionStatus } from "@/lib/company/kittl"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const company = new CompanyRepository()
  let automation: { available: boolean; mode?: string; counts?: Record<string, number>; jobs?: Array<{ id: string; productCode: string; productType: string; status: string; lastError: string | null }> ; reason?: string }
  try {
    const repository = new AutomationRepository()
    automation = {
      available: true, mode: repository.getPipelineMode(), counts: repository.countByStatus(),
      jobs: repository.listJobs(20).map(({ id, companyListingId, productCode, productType, status, lastError }) => ({ id, companyListingId, productCode, productType, status, lastError })),
    }
  } catch {
    automation = { available: false, reason: "Automation database is not configured or accessible." }
  }
  return NextResponse.json({
    ...company.overview(), automation,
    roles: COMPANY_ROLES.map((role) => role.status === "active" ? { ...role, name: company.agentConfig(role.id).name } : role),
    providers: {
      alura: { configured: Boolean(process.env.ALURA_API_KEY), enabled: process.env.COMPANY_RESEARCH_PROVIDER === "alura" && process.env.COMPANY_ALURA_RESEARCH_ENABLED === "1", credits: company.externalCredits("alura"), cap: Number(process.env.COMPANY_ALURA_CREDIT_CAP || 0) },
      kittl: { ...kittlConnectionStatus(), enabled: kittlConnectionStatus().connected },
    },
  })
}
