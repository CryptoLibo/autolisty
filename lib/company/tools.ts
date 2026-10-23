import { AutomationRepository } from "../automation/repository"
import { openAutomationReadDatabase } from "../automation/db/database"

export type JamesToolAccess = "owner_web" | "allowed_telegram"
export type JamesToolRequest = { name: "get_jobs"; limit?: number }

type JobSummary = {
  id: string
  productCode: string
  productType: string
  status: string
  updatedAt: string
}

export type GetJobsResult = {
  available: boolean
  pipelineMode?: string
  counts?: Record<string, number>
  jobs?: JobSummary[]
}

export function executeJamesTool(request: JamesToolRequest, access: JamesToolAccess): GetJobsResult {
  if (access !== "owner_web" && access !== "allowed_telegram") throw new Error("James tool access denied.")
  if (request.name !== "get_jobs") throw new Error("James tool is not permitted.")
  const limit = request.limit ?? 5
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error("Invalid job query limit.")

  let database
  try {
    database = openAutomationReadDatabase()
    const repository = new AutomationRepository(database)
    return {
      available: true,
      pipelineMode: repository.getPipelineMode(),
      counts: repository.countByStatus(),
      jobs: repository.listJobs(limit).map(({ id, productCode, productType, status, updatedAt }) => ({
        id, productCode, productType, status, updatedAt,
      })),
    }
  } catch {
    return { available: false }
  } finally {
    database?.close()
  }
}

export function formatJobsResult(result: GetJobsResult): string {
  if (!result.available) return "No puedo consultar los trabajos de Automation ahora. No he modificado ninguna tarea; revisa la configuración o disponibilidad de su base de datos."
  const counts = Object.entries(result.counts || {}).map(([status, count]) => `${status}: ${count}`).join(", ") || "ninguno"
  const jobs = result.jobs?.map((job) => `${job.productCode} (${job.productType}): ${job.status}`).join("\n") || "No hay trabajos registrados."
  return `Automation está en modo ${result.pipelineMode}. Totales por estado: ${counts}.\nÚltimos trabajos:\n${jobs}`
}
