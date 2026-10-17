import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { AUTOMATION_SCHEMA_VERSION } from "@/lib/automation/db/migrations"
import { AutomationRepository } from "@/lib/automation/repository"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized

  try {
    const database = getAutomationDatabase()
    const repository = new AutomationRepository(database)
    const schemaVersion = Number(database.pragma("user_version", { simple: true }))

    return NextResponse.json({
      ok: true,
      schemaVersion,
      expectedSchemaVersion: AUTOMATION_SCHEMA_VERSION,
      openJobs: repository.hasOpenJobs(),
      jobsByStatus: repository.countByStatus(),
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Automation database is unavailable."

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    )
  }
}
