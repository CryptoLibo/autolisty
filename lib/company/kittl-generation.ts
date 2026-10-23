import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { getCompanyDatabase } from "./db"
import { CompanyRepository } from "./repository"
import { callKittlTool } from "./kittl"
import { requireCompanyWorkerAlive } from "./worker-auth"

type RecordValue = Record<string, unknown>
export type Generation = { id: string; task_id: string; concept_index: number; prompt: string; model_id: string; workspace_id: string; aspect_ratio: string; reservation_id: string | null; job_id: string | null; status: string; image_url: string | null; image_path: string | null; edit_url: string | null; credit_cost: number | null; telegram_message_id: number | null; review_status: string | null; feedback: string | null }
const stamp = () => new Date().toISOString()
export const PILOT_KITTL_MODEL = "GPT Image 2.5 Flare"
const object = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {}
const firstArray = (value: unknown, keys: string[]): RecordValue[] => {
  if (Array.isArray(value)) return value.map(object)
  const data = object(value)
  for (const key of keys) if (Array.isArray(data[key])) return (data[key] as unknown[]).map(object)
  for (const key of ["data", "result"]) {
    const nested = object(data[key])
    for (const listKey of keys) if (Array.isArray(nested[listKey])) return (nested[listKey] as unknown[]).map(object)
  }
  return []
}
const modelRecords = (value: unknown, depth = 0): RecordValue[] => {
  if (depth > 10 || value === null || value === undefined) return []
  if (typeof value === "string") {
    const candidate = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    if (!/^[\[{]/.test(candidate)) return []
    try { return modelRecords(JSON.parse(candidate), depth + 1) } catch { return [] }
  }
  if (typeof value !== "object") return []
  if (Array.isArray(value)) {
    const records = value.map(object)
    if (records.some((item) => item.modelId || item.id) && records.some((item) => item.name || item.displayName || item.baseTokenCostEstimate !== undefined)) return records
    for (const item of value) {
      const nested = modelRecords(item, depth + 1)
      if (nested.length) return nested
    }
    return []
  }
  const record = object(value)
  if ((record.modelId || record.id) && (record.name || record.displayName || record.baseTokenCostEstimate !== undefined)) return [record]
  for (const key of ["models", "imageModels", "items", "results", "data", "result", "content", "output"]) {
    if (!(key in record)) continue
    const nested = modelRecords(record[key], depth + 1)
    if (nested.length) return nested
  }
  for (const nestedValue of Object.values(record)) {
    const nested = modelRecords(nestedValue, depth + 1)
    if (nested.length) return nested
  }
  return []
}
const text = (value: unknown) => typeof value === "string" ? value : ""
const integer = (value: unknown) => value !== null && value !== undefined && value !== "" && Number.isSafeInteger(Number(value)) ? Number(value) : null

export function parseKittlModels(raw: unknown) {
  return modelRecords(raw).map((item) => ({
    id: text(item.modelId || item.id), name: text(item.name || item.displayName || item.modelId || item.id), credits: integer(item.baseTokenCostEstimate ?? item.creditCost ?? item.tokenCost ?? object(item.pricing).baseTokenCostEstimate),
    description: text(item.description || item.bestFor).slice(0, 180),
    aspectRatios: Array.isArray(item.aspectRatios) ? item.aspectRatios.filter((ratio): ratio is string => typeof ratio === "string").slice(0, 12) : [],
  })).filter((item) => item.id && (item.credits === null || item.credits >= 0))
}

export function generation(id: string) {
  return getCompanyDatabase().prepare("SELECT * FROM company_kittl_generations WHERE id=?").get(id) as Generation | undefined
}

export function generationsForTask(taskId: string) {
  return getCompanyDatabase().prepare("SELECT * FROM company_kittl_generations WHERE task_id=? ORDER BY created_at DESC").all(taskId) as Generation[]
}

export async function drainKittlGenerations(limit = 10) {
  const rows = getCompanyDatabase().prepare("SELECT id FROM company_kittl_generations WHERE status IN ('QUEUED','IN_PROGRESS','READY','FAILED') ORDER BY updated_at LIMIT ?").all(limit) as Array<{ id: string }>
  const results: Array<{ id: string; status: string; error?: string }> = []
  for (const row of rows) {
    try {
      const current = await refreshKittlGeneration(row.id)
      if (current?.status === "FAILED") await notifyKittlFailure(row.id)
      results.push({ id: row.id, status: current?.status || "MISSING" })
    } catch (error) {
      results.push({ id: row.id, status: generation(row.id)?.status || "UNKNOWN", error: error instanceof Error ? error.message : "Unknown error" })
    }
  }
  return results
}

async function notifyKittlFailure(id: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID
  if (!token || !chatId) return
  const db = getCompanyDatabase()
  if (!db.prepare("UPDATE company_kittl_generations SET status='FAILURE_NOTIFYING',updated_at=? WHERE id=? AND status='FAILED'").run(stamp(), id).changes) return
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
    body: JSON.stringify({ chat_id: chatId, text: `Kittl no pudo completar la imagen ${id}. El trabajo quedó detenido; no lo repetiré automáticamente para evitar otro cargo. Revisa Company.` }),
  })
  const payload = await response.json().catch(() => ({})) as { ok?: boolean }
  if (!response.ok || !payload.ok) throw new Error("La notificación de error de Kittl no pudo confirmarse; revisar el chat antes de reintentar.")
  db.prepare("UPDATE company_kittl_generations SET status='FAILED_NOTIFIED',updated_at=? WHERE id=? AND status='FAILURE_NOTIFYING'").run(stamp(), id)
}

export async function kittlOptions() {
  const teamsResult = await callKittlTool("kittl-list-teams", {})
  const teams = firstArray(teamsResult, ["teams", "workspaces", "data"])
  const workspaceId = text(teams[0]?.workspaceId || teams[0]?.defaultTeamId || teams[0]?.id || object(teamsResult).workspaceId || object(teamsResult).defaultTeamId)
  if (!workspaceId) throw new Error("Kittl no devolvió un workspace utilizable.")
  const raw = await callKittlTool("kittl-list-media-generation-models", { workspaceId, typeFilter: "image" })
  let records = modelRecords(raw)
  let models = parseKittlModels(raw)
  if (!records.length) {
    const unfiltered = await callKittlTool("kittl-list-media-generation-models", { workspaceId })
    records = modelRecords(unfiltered)
    models = parseKittlModels(unfiltered)
  }
  if (!models.length) {
    const rootKeys = Object.keys(object(raw)).slice(0, 12).join(", ") || "sin claves JSON"
    const modelKeys = Object.keys(records[0] || {}).slice(0, 12).join(", ") || "sin lista de modelos"
    const message = text(object(raw).message || object(object(raw).structuredContent).message).slice(0, 300)
    throw new Error(`Kittl no devolvió una lista de modelos con ID. ${message ? `Respuesta: ${message}. ` : ""}Estructura: ${rootKeys}; campos: ${modelKeys}.`)
  }
  return { workspaceId, models }
}

export async function inspectKittlCatalog() {
  const teamsResult = await callKittlTool("kittl-list-teams", {})
  const teams = firstArray(teamsResult, ["teams", "workspaces", "data"])
  const workspaceId = text(teams[0]?.workspaceId || teams[0]?.defaultTeamId || teams[0]?.id || object(teamsResult).workspaceId || object(teamsResult).defaultTeamId)
  if (!workspaceId) return { workspaceId: null, teamsResult }
  const filtered = await callKittlTool("kittl-list-media-generation-models", { workspaceId, typeFilter: "image" })
  const unfiltered = await callKittlTool("kittl-list-media-generation-models", { workspaceId })
    .catch((error: unknown) => ({ error: error instanceof Error ? error.message : "Error sin filtro" }))
  return { workspaceId, filtered, unfiltered, parsedModels: parseKittlModels(filtered).length ? parseKittlModels(filtered) : parseKittlModels(unfiltered) }
}

export async function startKittlGeneration(taskId: string, conceptIndex: number, modelId: string, aspectRatio = "1:1", preflight?: Awaited<ReturnType<typeof kittlOptions>>) {
  if (!["1:1", "3:4", "4:3", "9:16", "16:9"].includes(aspectRatio)) throw new Error("Proporción de imagen no admitida.")
  if (!process.env.TELEGRAM_BOT_TOKEN || !/^-?\d+$/.test(process.env.TELEGRAM_ALLOWED_CHAT_ID || "")) throw new Error("Configura Telegram antes de generar una imagen en Kittl.")
  requireCompanyWorkerAlive()
  const repository = new CompanyRepository()
  const task = repository.task(taskId)
  if (!task || task.status !== "COMPLETED" && !(task.status === "RUNNING" && task.stage === "KITTL_SELECT" && task.image_requested)) throw new Error("La tarea de diseño aún no está terminada.")
  if (task.status === "RUNNING" && generationsForTask(taskId).length) throw new Error("Ya existe una generación de Kittl para este encargo; revisa su estado antes de continuar.")
  const artifact = repository.artifact(taskId, "design_concepts")
  const concepts = artifact?.data_json ? object(JSON.parse(artifact.data_json)).concepts : null
  if (!Array.isArray(concepts) || !Number.isInteger(conceptIndex) || conceptIndex < 0 || conceptIndex >= concepts.length) throw new Error("Concepto no encontrado.")
  const prompt = text(object(concepts[conceptIndex]).prompt)
  if (!prompt) throw new Error("El concepto no tiene prompt.")
  const options = preflight || await kittlOptions()
  const model = options.models.find((item) => item.id === modelId)
  if (!model) throw new Error("Modelo no disponible.")
  const dailyCap = Number(process.env.COMPANY_KITTL_DAILY_CAP || 200)
  if (!Number.isSafeInteger(dailyCap) || dailyCap < 1 || dailyCap > 400) throw new Error("COMPANY_KITTL_DAILY_CAP debe estar entre 1 y 400.")
  const credits = model.credits ?? dailyCap
  const balanceResult = object(await callKittlTool("kittl-get-token-balance", { workspaceId: options.workspaceId }))
  const balance = integer(balanceResult.balance ?? balanceResult.tokenBalance ?? balanceResult.remaining ?? object(balanceResult.data).balance)
  if (balance !== null && (model.credits === null ? balance < 1 : balance < credits)) throw new Error("No hay créditos suficientes en Kittl.")
  const db = getCompanyDatabase()
  const today = stamp().slice(0, 10)
  const id = crypto.randomUUID()
  db.transaction(() => {
    const used = db.prepare("SELECT COALESCE(SUM(COALESCE(credit_cost,0)),0) AS credits FROM company_kittl_generations WHERE created_at>=? AND status NOT IN ('FAILED_NO_CHARGE')").get(`${today}T00:00:00.000Z`) as { credits: number }
    if (used.credits + credits > dailyCap) throw new Error("Límite diario de créditos Kittl alcanzado.")
    db.prepare("INSERT INTO company_kittl_generations(id,task_id,concept_index,prompt,model_id,workspace_id,aspect_ratio,status,credit_cost,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .run(id, taskId, conceptIndex, prompt, modelId, options.workspaceId, aspectRatio, "STARTING", credits, stamp(), stamp())
  })()
  try {
    const result = object(await callKittlTool("kittl-generate-media", { type: "image", modelId, workspaceId: options.workspaceId, prompt, aspectRatio }))
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

export async function refreshKittlGeneration(id: string, token = process.env.TELEGRAM_BOT_TOKEN, chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID, send: typeof fetch = fetch, assetRoot = path.dirname(process.env.COMPANY_DB_PATH || path.join(process.cwd(), "data", "autolisty-company.sqlite"))) {
  const row = generation(id)
  if (!row?.job_id || !["QUEUED", "IN_PROGRESS", "READY"].includes(row.status)) return row
  const db = getCompanyDatabase()
  if (row.status !== "READY") {
    const result = object(await callKittlTool("kittl-get-media-generation-status", { jobId: row.job_id }))
    const status = text(result.status || object(result.data).status).toUpperCase()
    if (status === "FAILED" || status === "ERROR" || status === "CANCELLED" || status === "COMPLETE" && !text(result.url || result.imageUrl || object(result.data).url)) {
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
  let bytes: Uint8Array<ArrayBuffer>
  try {
    const imageResponse = await send(ready.image_url!, { redirect: "error", cache: "no-store" })
    const length = Number(imageResponse.headers.get("content-length"))
    if (!imageResponse.ok || imageResponse.headers.get("content-type")?.split(";")[0] !== "image/png" || length > 10_000_000) throw new Error("La imagen de Kittl no cumple el límite de Telegram.")
    bytes = new Uint8Array(await imageResponse.arrayBuffer())
    if (bytes.length > 10_000_000 || bytes.length < 8 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) throw new Error("El PNG de Kittl es inválido o demasiado grande.")
  } catch (error) {
    db.prepare("UPDATE company_kittl_generations SET status='READY',updated_at=? WHERE id=? AND status='SENDING'").run(stamp(), id)
    throw error
  }
  const assetDirectory = path.join(assetRoot, "kittl-images")
  const imagePath = path.join(assetDirectory, `${id}.png`)
  const temporaryPath = `${imagePath}.${crypto.randomUUID()}.tmp`
  try {
    fs.mkdirSync(assetDirectory, { recursive: true })
    fs.writeFileSync(temporaryPath, bytes, { flag: "wx", mode: 0o600 })
    fs.renameSync(temporaryPath, imagePath)
    db.prepare("UPDATE company_kittl_generations SET image_path=?,updated_at=? WHERE id=? AND status='SENDING'").run(imagePath, stamp(), id)
  } catch (error) {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath)
    db.prepare("UPDATE company_kittl_generations SET status='READY',updated_at=? WHERE id=? AND status='SENDING'").run(stamp(), id)
    throw error
  }
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
  return db.transaction(() => {
    const row = generation(id)
    if (!row || row.status !== "SENT" || row.review_status) return false
    db.prepare("UPDATE company_kittl_generations SET review_status=?,updated_at=? WHERE id=? AND review_status IS NULL").run(verdict === "approved" ? "APPROVED" : "AWAITING_FEEDBACK", stamp(), id)
    if (verdict === "approved") new CompanyRepository(db).saveDesignReview(row.task_id, row.concept_index, "approved", "Aprobado en Telegram", row.edit_url || row.image_url)
    return true
  })()
}

export function saveKittlFeedback(chatId: string, feedback: string) {
  if (chatId !== process.env.TELEGRAM_ALLOWED_CHAT_ID || !feedback.trim() || feedback.length > 8000) return false
  const db = getCompanyDatabase()
  const row = db.prepare("SELECT * FROM company_kittl_generations WHERE review_status='AWAITING_FEEDBACK' ORDER BY updated_at DESC LIMIT 1").get() as Generation | undefined
  if (!row) return false
  return db.transaction(() => {
    db.prepare("UPDATE company_kittl_generations SET review_status='REVISION_REQUESTED',feedback=?,updated_at=? WHERE id=?").run(feedback.trim(), stamp(), row.id)
    new CompanyRepository(db).saveDesignReview(row.task_id, row.concept_index, "revise", feedback.trim(), row.edit_url)
    return row
  })()
}
