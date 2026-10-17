import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { CompanyRepository } from "@/lib/company/repository"
import { fetchOfficialDailyBilling } from "@/lib/company/official-billing"
import { utcDay } from "@/lib/company/quota"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const adminKey = process.env.OPENAI_ADMIN_KEY
  const projectId = process.env.COMPANY_OPENAI_PROJECT_ID
  if (!adminKey) return NextResponse.json({ error: "Official billing is not configured." }, { status: 503 })
  const body = await request.json().catch(() => ({})) as { dayUtc?: string }
  try {
    const snapshot = await fetchOfficialDailyBilling(body.dayUtc || utcDay(), projectId, adminKey)
    new CompanyRepository().saveOfficialDailyBilling(snapshot)
    return NextResponse.json(snapshot)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Billing sync failed." }, { status: 502 })
  }
}
