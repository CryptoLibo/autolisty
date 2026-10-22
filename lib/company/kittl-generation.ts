import crypto from "node:crypto"
import { getCompanyDatabase } from "./db"
import { CompanyRepository } from "./repository"
import { callKittlTool } from "./kittl"

type RecordValue = Record<string, unknown>
export type Generation = { id: string; task_id: string; concept_index: number; prompt: string; model_id: string; workspace_id: string; reservation_id: string | null; job_id: string | null; status: string; image_url: string | null; edit_url: string | null; credit_cost: number | null; telegram_message_id: number | null; review_status: string | null; feedback: string | null }
const stamp = () => new Date().toISOString()
const object = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {}
const firstArray = (value: unknown, keys: string[]): RecordValue[] => {
  if (Array.isArray(value)) return value.map(object)
  const data = object(value)
  for (const key of keys) if (Array.isArray(data[key])) return (data[key] as unknown[]).map(object)
  return []
}
const text = (value: unknown) => typeof value === "string" ? value : ""
const integer = (value: unknown) => value !== null && value !== undefined && value !== "" && Number.isSafeInteger(Number(value)) ? Number(value) : null

export function generation(id: string) {
  return getCompanyDatabase().prepare("SELECT * FROM company_kittl_generations WHERE id=?").get(id) as Generation | undefined
}

export function generationsForTask(taskId: string) {
  return getCompanyDatabase().prepare("SELECT * FROM company_kittl_generations WHERE task_id=? ORDER BY created_at DESC").all(taskId) as Generation[]
}

export async function kittlOptions() {
  const teamsResult = await callKittlTool("kittl-list-teams", {})
  const teams = firstArray(teamsResult, ["teams", "workspaces", "data"])
  const workspaceId = text(teams[0]?.workspaceId || teams[0]?.defaultTeamId || teams[0]?.id || object(teamsResult).workspaceId || object(teamsResult).defaultTeamId)
  if (!workspaceId) throw new Error("Kittl no devolvió un workspace utilizable.")
  const raw = await callKittlTool("kittl-list-media-generation-models", { workspaceId, typeFilter: "image" })
  const models = firstArray(raw, ["models", "data", "results"]).map((item) => ({
    id: text(item.modelId || item.id), name: text(item.name || item.displayName || item.modelId || item.id), credits: integer(item.baseTokenCostEstimate ?? item.creditCost ?? item.tokenCost),
  })).filter((item) => item.id && item.credits !== null && item.credits >= 0)
  if (!models.length) throw new Error("Kittl no devolvió modelos de imagen con coste conocido.")
  return { workspaceId, models }
}

export async function startKittlGeneration(taskId: string, conceptIndex: number, modelId: string) {
  const repository = new CompanyRepository()
  const task = repository.task(taskId)
  if (!task || task.status !== "COMPLETED") throw new Error("La tarea de diseño aún no está terminada.")
  const artifact = repository.artifact(taskId, "design_concepts")
  const concepts = artifact?.data_json ? object(JSON.parse(artifact.data_json)).concepts : null
  if (!Array.isArray(concepts) || !Number.isInteger(conceptIndex) || conceptIndex < 0 || conceptIndex >= concepts.length) throw new Error("Concepto no encontrado.")
  const prompt = text(object(concepts[conceptIndex]).prompt)
  if (!prompt) throw new Error("El concepto no tiene prompt.")
  const options = await kittlOptions()
  const model = options.models.find((item) => item.id === modelId)
  if (!model || model.credits === null) throw new Error("Modelo no disponible.")
  const credits = model.credits
  const balanceResult = object(await callKittlTool("kittl-get-token-balance", { workspaceId: options.workspaceId }))
  const balance = integer(balanceResult.balance ?? balanceResult.tokenBalance ?? balanceResult.remaining ?? object(balanceResult.data).balance)
  if (balance !== null && balance < credits) throw new Error("No hay créditos suficientes en Kittl.")
  const dailyCap = Number(process.env.COMPANY_KITTL_DAILY_CAP || 200)
  if (!Number.isSafeInteger(dailyCap) || dailyCap < 1 || dailyCap > 400) throw new Error("COMPANY_KITTL_DAILY_CAP debe estar entre 1 y 400.")
  const db = getCompanyDatabase()
  const today = stamp().slice(0, 10)
  const id = crypto.randomUUID()
  db.transaction(() => {
    const used = db.prepare("SELECT COALESCE(SUM(COALESCE(credit_cost,0)),0) AS credits FROM company_kittl_generations WHERE created_at>=? AND status NOT IN ('FAILED_NO_CHARGE')").get(`${today}T00:00:00.000Z`) as { credits: number }
    if (used.credits + credits > dailyCap) throw new Error("Límite diario de créditos Kittl alcanzado.")
    db.prepare("INSERT INTO company_kittl_generations(id,task_id,concept_index,prompt,model_id,workspace_id,status,credit_cost,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(id, taskId, conceptIndex, prompt, modelId, options.workspaceId, "STARTING", credits, stamp(), stamp())
  })()
  try {
    const result = object(await callKittlTool("kittl-generate-media", { type: "image", modelId, workspaceId: options.workspaceId, prompt, aspectRatio: "1:1" }))
    const jobId = text(result.jobId || object(result.data).jobId)
    if (!jobId) throw new Error("Kittl no devolvió el identificador de la generación.")
    const actual = integer(result.creditCost)
    db.prepare("UPDATE company_kittl_generations SET job_id=?,status='QUEUED',credit_cost=?,updated_at=? WHERE id=?")
      .run(jobId, actual ?? credits, stamp(), id)
    return generation(id)!
  } catch {
    db.prepare("UPDATE company_kittl_generations SET status='UNCERTAIN',updated_at=? WHERE id=?").run(stamp(), id)
    throw new Error("No se pudo confirmar la generación. Revisa Kittl antes de intentarlo otra vez; podría haber consumido créditos.")
  }
}

export async function refreshKittlGeneration(id: string, token = process.env.TELEGRAM_BOT_TOKEN, chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID, send: typeof fetch = fetch) {
  const row = generation(id)
  if (!row?.job_id || !["QUEUED", "IN_PROGRESS", "READY"].includes(row.status)) return row
  const db = getCompanyDatabase()
  if (row.status !== "READY") {
    const result = object(await callKittlTool("kittl-get-media-generation-status", { jobId: row.job_id }))
    const status = text(result.status || object(result.data).status).toUpperCase()
    if (status === "FAILED") {
      db.prepare("UPDATE company_kittl_generations SET status='FAILED',updated_at=? WHERE id=?").run(stamp(), id)
      return generation(id)
    }
    const url = text(result.url || result.imageUrl || object(result.data).url)
    if (!url) {
      db.prepare("UPDATE company_kittl_generations SET status='IN_PROGRESS',updated_at=? WHERE id=?").run(stamp(), id)
      return generation(id)
    }
    const parsed = new URL(url)
    if (parsed.protocol !== "https:" || parsed.hostname !== "cache.kittl.com") throw new Error("Kittl devolvió una URL de imagen no autorizada.")
    db.prepare("UPDATE company_kittl_generations SET status='READY',image_url=?,edit_url=?,updated_at=? WHERE id=?")
      .run(url, text(result.editUrl || object(result.data).editUrl) || null, stamp(), id)
  }
  const ready = generation(id)!
  if (!token || !chatId || !/^-?\d+$/.test(chatId)) return ready
  if (ready.telegram_message_id) return ready
  const claimed = db.prepare("UPDATE company_kittl_generations SET status='SENDING',updated_at=? WHERE id=? AND status='READY'").run(stamp(), id).changes
  if (!claimed) return generation(id)
  const imageResponse = await send(ready.image_url!, { redirect: "error", cache: "no-store" })
  const length = Number(imageResponse.headers.get("content-length"))
  if (!imageResponse.ok || imageResponse.headers.get("content-type")?.split(";")[0] !== "image/png" || length > 10_000_000) throw new Error("La imagen de Kittl no cumple el límite de Telegram.")
  const bytes = new Uint8Array(await imageResponse.arrayBuffer())
  if (bytes.length > 10_000_000 || bytes.length < 8 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) throw new Error("El PNG de Kittl es inválido o demasiado grande.")
  const form = new FormData()
  form.set("chat_id", chatId)
  form.set("photo", new Blob([bytes], { type: "image/png" }), `${id}.png`)
  form.set("caption", `Diseño de Kittl listo para revisar. Modelo: ${ready.model_id}. Créditos: ${ready.credit_cost ?? "?"}.`)
  form.set("reply_markup", JSON.stringify({ inline_keyboard: [[{ text: "Aprobar", callback_data: `kg:a:${id}` }, { text: "Pedir cambios", callback_data: `kg:r:${id}` }]] }))
  const response = await send(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST", cache: "no-store", body: form,
  })
  const payload = await response.json().catch(() => ({})) as { ok?: boolean; result?: { message_id?: number } }
  if (!response.ok || !payload.ok || !payload.result?.message_id) throw new Error("Envío a Telegram incierto; comprueba el chat antes de reintentar.")
  db.prepare("UPDATE company_kittl_generations SET status='SENT',telegram_message_id=?,updated_at=? WHERE id=?")
    .run(payload.result.message_id, stamp(), id)
  return generation(id)
}

export function reviewKittlGeneration(id: string, verdict: "approved" | "revise", chatId: string) {
  if (chatId !== process.env.TELEGRAM_ALLOWED_CHAT_ID) return false
  const db = getCompanyDatabase()
  const row = generation(id)
  if (!row || row.status !== "SENT" || row.review_status) return false
  db.prepare("UPDATE company_kittl_generations SET review_status=?,updated_at=? WHERE id=? AND review_status IS NULL").run(verdict === "approved" ? "APPROVED" : "AWAITING_FEEDBACK", stamp(), id)
  if (verdict === "approved") new CompanyRepository().saveDesignReview(row.task_id, row.concept_index, "approved", "Aprobado en Telegram", row.edit_url || row.image_url)
  return true
}

export function saveKittlFeedback(chatId: string, feedback: string) {
  if (chatId !== process.env.TELEGRAM_ALLOWED_CHAT_ID || !feedback.trim() || feedback.length > 8000) return false
  const db = getCompanyDatabase()
  const row = db.prepare("SELECT * FROM company_kittl_generations WHERE review_status='AWAITING_FEEDBACK' ORDER BY updated_at DESC LIMIT 1").get() as Generation | undefined
  if (!row) return false
  db.prepare("UPDATE company_kittl_generations SET review_status='REVISION_REQUESTED',feedback=?,updated_at=? WHERE id=?").run(feedback.trim(), stamp(), row.id)
  new CompanyRepository().saveDesignReview(row.task_id, row.concept_index, "revise", feedback.trim(), row.edit_url)
  return true
}
