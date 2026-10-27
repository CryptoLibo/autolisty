import { openAutomationReadDatabase } from "../automation/db/database"

export function researchSchemaGate(): Response | null {
  try {
    openAutomationReadDatabase().close()
    return null
  } catch {
    return Response.json({ error: "Research database migration is pending. Existing data was not changed." }, { status: 409 })
  }
}
