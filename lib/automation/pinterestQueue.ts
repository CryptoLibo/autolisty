// Cola de Pinterest: los pines de todos los listings salen de uno en uno, espaciados.
//
// Reglas (ajustables en automation_settings, claves pinterest.*):
// - Al publicarse un listing en Etsy se preparan sus 3 pines (imagen + título y
//   descripción distintos). Pin 1 entra en la cola ese mismo día; cada pin siguiente
//   del mismo listing espera al menos 24 h desde el anterior (pin 2 ≈ día siguiente,
//   pin 3 ≈ dos días después).
// - Horario: 10:00–24:00 de Lisboa. Entre dos pines cualesquiera, al menos 25 min.
// - Máximo 30 pines al día; lo que no cabe pasa al día siguiente.
// - Prioridad: pines 1 (listings nuevos), luego pines 2 y luego pines 3; dentro de
//   cada grupo, el que lleva más tiempo esperando. Se alternan tableros si se puede.
// - Si Pinterest bloquea (429 / código 9 / spam): toda la cola se pausa 6 h, un solo
//   aviso, sin gastar reintentos ni mandar listings a incidencias.
//
// La misma proyección decide qué pin sale ahora y qué ves en Automation (hora
// aproximada del próximo pin de cada listing), así nunca se contradicen.
import type { PostProductionDeps } from "./postProduction"
import type { AutomationRepository } from "./repository"
import type { AutomationJob } from "./types"

export type PinterestPlanPin = {
  id: string
  imageUrl: string
  title: string
  description: string
  keyword?: string | null
  pinId: string | null
  publishingAt?: string | null
  publishedAt?: string | null
}

export type PinterestPlan = {
  /** 2 = plan de la cola (pines espaciados). Sin versión = plan antiguo. */
  version?: number
  createdAt?: string
  boardId: string
  boardName: string
  pins: PinterestPlanPin[]
}

export type PinterestQueueSettings = {
  timeZone: string
  windowStartHour: number
  windowEndHour: number
  gapMinutes: number
  dailyCap: number
  pauseHours: number
  listingGapHours: number
}

export const DEFAULT_PINTEREST_QUEUE_SETTINGS: PinterestQueueSettings = {
  timeZone: "Europe/Lisbon",
  windowStartHour: 10,
  windowEndHour: 24,
  gapMinutes: 25,
  dailyCap: 30,
  pauseHours: 6,
  listingGapHours: 24,
}

const SETTING_KEYS: Record<Exclude<keyof PinterestQueueSettings, "timeZone">, string> = {
  windowStartHour: "pinterest.window_start_hour",
  windowEndHour: "pinterest.window_end_hour",
  gapMinutes: "pinterest.gap_minutes",
  dailyCap: "pinterest.daily_cap",
  pauseHours: "pinterest.pause_hours",
  listingGapHours: "pinterest.listing_gap_hours",
}
const LOG_KEY = "pinterest.publish_log"
const PAUSED_UNTIL_KEY = "pinterest.paused_until"
const LAST_ATTEMPT_KEY = "pinterest.last_attempt_at"
const LOG_KEEP_MS = 3 * 24 * 3_600_000

type SettingsStore = Pick<AutomationRepository, "getSettingValue" | "setSettingValue" | "autolistyPinsSince">

export function readQueueSettings(repository: SettingsStore): PinterestQueueSettings {
  const settings = { ...DEFAULT_PINTEREST_QUEUE_SETTINGS }
  for (const [field, key] of Object.entries(SETTING_KEYS) as Array<[keyof typeof SETTING_KEYS, string]>) {
    const value = Number(repository.getSettingValue(key))
    if (repository.getSettingValue(key) !== null && Number.isFinite(value) && value >= 0) settings[field] = value
  }
  return settings
}

// ---- Hora de Lisboa ----

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") }
}

function offsetMs(date: Date, timeZone: string) {
  const p = localParts(date, timeZone)
  const minuteFloor = Math.floor(date.getTime() / 60_000) * 60_000
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - minuteFloor
}

/** Instante UTC de una hora local (día que puede desbordar: día 32 = día 1 del mes siguiente). */
function localToUtc(year: number, month: number, day: number, hour: number, timeZone: string) {
  const guess = Date.UTC(year, month - 1, day, hour)
  let result = guess - offsetMs(new Date(guess), timeZone)
  result = guess - offsetMs(new Date(result), timeZone)
  return new Date(result)
}

export function localDayKey(date: Date, timeZone: string) {
  const p = localParts(date, timeZone)
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
}

function windowStartOfDay(date: Date, settings: PinterestQueueSettings, dayOffset = 0) {
  const p = localParts(date, settings.timeZone)
  return localToUtc(p.year, p.month, p.day + dayOffset, settings.windowStartHour, settings.timeZone)
}

/** La primera hora válida ≥ t dentro del horario de publicación. */
function clampToWindow(t: Date, settings: PinterestQueueSettings) {
  const hour = localParts(t, settings.timeZone).hour
  if (hour < settings.windowStartHour) return windowStartOfDay(t, settings)
  if (hour >= settings.windowEndHour) return windowStartOfDay(t, settings, 1)
  return t
}

export function formatLocalTime(date: Date, timeZone = DEFAULT_PINTEREST_QUEUE_SETTINGS.timeZone) {
  return new Intl.DateTimeFormat("es-ES", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date)
}

// ---- Estado de la cola ----

export type PublishLogEntry = { at: string; boardId: string | null }

export type PinterestQueueState = {
  log: PublishLogEntry[]
  pausedUntil: Date | null
  lastAttemptAt: Date | null
}

export function readQueueState(repository: SettingsStore, now: Date): PinterestQueueState {
  const since = now.getTime() - LOG_KEEP_MS
  let log: PublishLogEntry[]
  const raw = repository.getSettingValue(LOG_KEY)
  if (raw === null) {
    // Primera vez: se siembra con los pines que Autolisty ya publicó (cuentan para el máximo de hoy).
    log = repository.autolistyPinsSince(new Date(since).toISOString())
    repository.setSettingValue(LOG_KEY, JSON.stringify(log))
  } else {
    try { log = JSON.parse(raw) as PublishLogEntry[] } catch { log = [] }
  }
  log = log.filter((entry) => new Date(entry.at).getTime() >= since)
  const paused = repository.getSettingValue(PAUSED_UNTIL_KEY)
  const attempt = repository.getSettingValue(LAST_ATTEMPT_KEY)
  return {
    log,
    pausedUntil: paused ? new Date(paused) : null,
    lastAttemptAt: attempt ? new Date(attempt) : null,
  }
}

function appendToLog(repository: SettingsStore, state: PinterestQueueState, entry: PublishLogEntry, now: Date) {
  const since = now.getTime() - LOG_KEEP_MS
  state.log = [...state.log, entry].filter((item) => new Date(item.at).getTime() >= since)
  repository.setSettingValue(LOG_KEY, JSON.stringify(state.log))
}

// ---- Proyección ----

export type PinChain = {
  jobId: string
  productCode: string
  boardId: string
  /** Posición (1..total) del próximo pin sin publicar. */
  nextIndex: number
  total: number
  nextDueAt: Date
}

export type ProjectedPin = { jobId: string; productCode: string; index: number; at: Date }

export function parsePlan(job: Pick<AutomationJob, "pinterestSeoJson">): PinterestPlan | null {
  if (!job.pinterestSeoJson) return null
  try { return JSON.parse(job.pinterestSeoJson) as PinterestPlan } catch { return null }
}

export function chainForJob(job: AutomationJob, plan: PinterestPlan, settings: PinterestQueueSettings, now: Date): PinChain | null {
  const index = plan.pins.findIndex((pin) => !pin.pinId)
  if (index < 0) return null
  const previous = index > 0 ? plan.pins[index - 1] : null
  const previousAt = previous ? (previous.publishedAt || previous.publishingAt || job.updatedAt) : null
  const nextDueAt = previousAt
    ? new Date(new Date(previousAt).getTime() + settings.listingGapHours * 3_600_000)
    : new Date(plan.createdAt || now.toISOString())
  return { jobId: job.id, productCode: job.productCode, boardId: plan.boardId, nextIndex: index + 1, total: plan.pins.length, nextDueAt }
}

/** Orden y hora aproximada en que saldrán los pines pendientes según las reglas. */
export function projectQueue(chains: PinChain[], state: PinterestQueueState, settings: PinterestQueueSettings, now: Date, max = 300): ProjectedPin[] {
  const gapMs = settings.gapMinutes * 60_000
  const counts = new Map<string, number>()
  for (const entry of state.log) {
    const key = localDayKey(new Date(entry.at), settings.timeZone)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const lastPublished = state.log.length ? new Date(state.log[state.log.length - 1].at).getTime() : 0
  const lastAt = Math.max(lastPublished, state.lastAttemptAt?.getTime() || 0)
  let lastBoard = state.log.length ? state.log[state.log.length - 1].boardId : null
  let t = new Date(Math.max(now.getTime(), lastAt ? lastAt + gapMs : 0, state.pausedUntil?.getTime() || 0))

  const working = chains.map((chain) => ({ ...chain }))
  const out: ProjectedPin[] = []
  for (let guard = 0; guard < 10_000 && out.length < max && working.length; guard += 1) {
    t = clampToWindow(t, settings)
    const day = localDayKey(t, settings.timeZone)
    if ((counts.get(day) || 0) >= settings.dailyCap) {
      t = windowStartOfDay(t, settings, 1)
      continue
    }
    const ready = working.filter((chain) => chain.nextDueAt.getTime() <= t.getTime())
    if (!ready.length) {
      t = new Date(Math.min(...working.map((chain) => chain.nextDueAt.getTime())))
      continue
    }
    ready.sort((a, b) => a.nextIndex - b.nextIndex || a.nextDueAt.getTime() - b.nextDueAt.getTime())
    const pick = ready.find((chain) => chain.nextIndex === ready[0].nextIndex && chain.boardId !== lastBoard) || ready[0]
    out.push({ jobId: pick.jobId, productCode: pick.productCode, index: pick.nextIndex, at: t })
    counts.set(day, (counts.get(day) || 0) + 1)
    lastBoard = pick.boardId
    pick.nextIndex += 1
    if (pick.nextIndex > pick.total) working.splice(working.indexOf(pick), 1)
    else pick.nextDueAt = new Date(t.getTime() + settings.listingGapHours * 3_600_000)
    t = new Date(t.getTime() + gapMs)
  }
  return out
}

// ---- Publicación ----

/** Pinterest frenó la publicación: límite de peticiones o bloqueo temporal por spam. */
export function isPinterestBlock(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /\b429\b|"code"\s*:\s*9\b|spam/i.test(message)
}

function isTransientPinError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /\b(500|502|503|504)\b|timeout|timed out|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up/i.test(message)
}

function errorText(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2000)
}

export type PinterestQueueDeps = Pick<PostProductionDeps,
  "repository" | "getPinterestToken" | "publishPin" | "findExistingPin" | "recordPin" | "notify" | "now">

function queueJobs(repository: AutomationRepository) {
  return repository.listPostProductionJobs(["PINTEREST_PUBLISHING"], 200)
    .map((job) => ({ job, plan: parsePlan(job) }))
    .filter((item): item is { job: AutomationJob; plan: PinterestPlan } => Boolean(item.plan && item.plan.version && item.plan.version >= 2))
}

export function completedNotification(job: AutomationJob, boardName: string) {
  return {
    title: "Listing completado",
    body: `${job.productCode}: publicado en Etsy y pines en Pinterest${boardName ? ` ("${boardName}")` : ""}.`,
    url: job.etsyUrl || "/automation",
    tag: `done-${job.productCode}`,
  }
}

/** Una pasada de la cola: publica como mucho un pin, si ya le toca. */
export async function runPinterestQueue(deps: PinterestQueueDeps): Promise<{ published?: string; pausedUntil?: string } | null> {
  const repository = deps.repository
  const now = (deps.now || (() => new Date()))()
  const settings = readQueueSettings(repository)
  const state = readQueueState(repository, now)
  if (state.pausedUntil && state.pausedUntil.getTime() > now.getTime()) return null
  if (state.pausedUntil) repository.setSettingValue(PAUSED_UNTIL_KEY, null)

  const items = queueJobs(repository)
  const chains = items
    .map(({ job, plan }) => chainForJob(job, plan, settings, now))
    .filter((chain): chain is PinChain => Boolean(chain))
  const next = projectQueue(chains, { ...state, pausedUntil: null }, settings, now, 1)[0]
  if (!next || next.at.getTime() > now.getTime()) return null

  const item = items.find(({ job }) => job.id === next.jobId)!
  let job = item.job
  const plan = item.plan
  const pin = plan.pins[next.index - 1]
  const save = () => { job = repository.updatePostProductionFields(job.id, { pinterestSeoJson: JSON.stringify(plan) })! }
  const etsyUrl = job.etsyUrl
  if (!etsyUrl) {
    repository.transitionJob(job.id, "NEEDS_ATTENTION", { error: "Falta la URL pública del listing de Etsy.", resumeStatus: "PINTEREST_PUBLISHING" })
    return null
  }
  const token = await deps.getPinterestToken()
  if (!token) {
    if (!repository.lastEventIs(job.id, "PINTEREST_DISCONNECTED")) {
      repository.recordJobEvent(job.id, "PINTEREST_DISCONNECTED", "Pinterest no está conectado en Autolisty; la cola espera.")
      await deps.notify?.({ title: "Pinterest desconectado", body: "La cola de pines espera hasta que conectes Pinterest en Autolisty.", url: "/automation", tag: "pinterest-pause" }).catch(() => {})
    }
    return null
  }

  try {
    let existing: string | null = null
    if (pin.publishingAt && deps.findExistingPin) {
      existing = await deps.findExistingPin(token, { boardId: plan.boardId, title: pin.title, link: etsyUrl })
    }
    if (existing) {
      pin.pinId = existing
      pin.publishedAt = pin.publishingAt
      save()
    } else {
      pin.publishingAt = now.toISOString()
      save()
      repository.setSettingValue(LAST_ATTEMPT_KEY, now.toISOString())
      const published = await deps.publishPin(token, {
        boardId: plan.boardId,
        title: pin.title,
        description: pin.description,
        link: etsyUrl,
        imageUrl: pin.imageUrl,
        altText: pin.title.slice(0, 500),
      })
      pin.pinId = published.pinId
      pin.publishedAt = now.toISOString()
      save()
      appendToLog(repository, state, { at: now.toISOString(), boardId: plan.boardId }, now)
      try {
        deps.recordPin({ pinId: published.pinId, boardId: published.boardId, title: pin.title, destinationUrl: etsyUrl, imageUrl: pin.imageUrl })
      } catch (error) {
        repository.recordJobEvent(job.id, "WARNING", `Pin publicado pero sin vínculo analítico: ${errorText(error)}`)
      }
    }
    repository.recordJobEvent(job.id, "PIN_PUBLISHED", `Pin ${next.index}/${plan.pins.length} publicado en "${plan.boardName}".`)
  } catch (error) {
    if (isPinterestBlock(error)) {
      // Pinterest respondió con error: el pin no se creó.
      pin.publishingAt = null
      save()
      const until = new Date(now.getTime() + settings.pauseHours * 3_600_000)
      repository.setSettingValue(PAUSED_UNTIL_KEY, until.toISOString())
      repository.recordJobEvent(job.id, "WARNING", `Pinterest frenó la publicación; cola en pausa hasta las ${formatLocalTime(until, settings.timeZone)}. ${errorText(error).slice(0, 200)}`)
      await deps.notify?.({
        title: `Pinterest en pausa hasta las ${formatLocalTime(until, settings.timeZone)}`,
        body: "Pinterest frenó la publicación (bloqueo temporal). La cola sigue sola a esa hora; no hay que hacer nada.",
        url: "/automation",
        tag: "pinterest-pause",
      }).catch(() => {})
      return { pausedUntil: until.toISOString() }
    }
    if (isTransientPinError(error)) {
      // Fallo pasajero: se reintenta tras la separación normal entre pines.
      repository.recordJobEvent(job.id, "WARNING", `Pin ${next.index} no publicado (fallo temporal), se reintenta: ${errorText(error).slice(0, 200)}`)
      return null
    }
    job = repository.transitionJob(job.id, "NEEDS_ATTENTION", { error: errorText(error), resumeStatus: "PINTEREST_PUBLISHING" })
    await deps.notify?.({
      title: "Un listing necesita atención",
      body: `${job.productCode}: ${errorText(error).slice(0, 200)}`,
      url: "/automation",
      tag: `attention-${job.productCode}`,
    }).catch(() => {})
    return null
  }

  if (plan.pins.every((item) => item.pinId)) {
    job = repository.transitionJob(job.id, "COMPLETED", { message: `${plan.pins.length} pines publicados en "${plan.boardName}".` })
    await deps.notify?.(completedNotification(job, plan.boardName)).catch(() => {})
  }
  return { published: `${job.productCode}#${next.index}` }
}

// ---- Vista para Automation ----

export type PinterestJobProgress = { published: number; total: number; nextAt: string | null }

export type PinterestQueueOverview = {
  pausedUntil: string | null
  dailyCap: number
  today: { published: number; pending: number }
  tomorrow: { pending: number }
  byJob: Record<string, PinterestJobProgress>
}

export function pinterestQueueOverview(repository: AutomationRepository, now = new Date()): PinterestQueueOverview {
  const settings = readQueueSettings(repository)
  const state = readQueueState(repository, now)
  const paused = state.pausedUntil && state.pausedUntil.getTime() > now.getTime() ? state.pausedUntil : null
  const items = queueJobs(repository)
  const chains = items
    .map(({ job, plan }) => chainForJob(job, plan, settings, now))
    .filter((chain): chain is PinChain => Boolean(chain))
  const projected = projectQueue(chains, { ...state, pausedUntil: paused }, settings, now)
  const today = localDayKey(now, settings.timeZone)
  const tomorrow = localDayKey(windowStartOfDay(now, settings, 1), settings.timeZone)
  const byJob: Record<string, PinterestJobProgress> = {}
  for (const { job, plan } of items) {
    const nextPin = projected.find((pin) => pin.jobId === job.id)
    byJob[job.id] = {
      published: plan.pins.filter((pin) => pin.pinId).length,
      total: plan.pins.length,
      nextAt: nextPin ? nextPin.at.toISOString() : null,
    }
  }
  return {
    pausedUntil: paused ? paused.toISOString() : null,
    dailyCap: settings.dailyCap,
    today: {
      published: state.log.filter((entry) => localDayKey(new Date(entry.at), settings.timeZone) === today).length,
      pending: projected.filter((pin) => localDayKey(pin.at, settings.timeZone) === today).length,
    },
    tomorrow: { pending: projected.filter((pin) => localDayKey(pin.at, settings.timeZone) === tomorrow).length },
    byJob,
  }
}
