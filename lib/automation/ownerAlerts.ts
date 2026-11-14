import type Database from "better-sqlite3"

// Alertas al propietario que no dependen de un trabajo concreto:
// diseños nuevos por aprobar y encendido/apagado de Automaty.

export type OwnerNotify = (input: { title: string; body: string; url?: string | null; tag?: string | null }) => Promise<void>

const DESIGNS_CURSOR_KEY = "alerts.pending_designs_cursor"
/** Se espera a que el lote deje de crecer antes de avisar (un aviso por lote, no por diseño). */
export const DESIGN_BATCH_SETTLE_MS = 5 * 60_000
/** Un "encendido" a menos de esto del último contacto es un reinicio del agente, no un arranque del PC. */
export const AGENT_RESTART_GRACE_MS = 15 * 60_000

const LOCAL_QUEUE_STATUSES = ["QUEUED_LOCAL", "LOCAL_CLAIMED", "LOCAL_BUILDING", "LOCAL_VALIDATING", "LOCAL_UPLOADING"]

function getSetting(database: Database.Database, key: string) {
  const row = database
    .prepare("SELECT setting_value FROM automation_settings WHERE setting_key = ?")
    .get(key) as { setting_value: string } | undefined
  return row?.setting_value ?? null
}

function setSetting(database: Database.Database, key: string, value: string) {
  database.prepare(`
    INSERT INTO automation_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at
  `).run(key, value, new Date().toISOString())
}

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

/**
 * Un aviso por lote de diseños nuevos en PENDING_APPROVAL, cuando el lote lleva
 * DESIGN_BATCH_SETTLE_MS sin crecer. La primera vez solo fija el cursor.
 */
export async function alertNewPendingDesigns(database: Database.Database, notify: OwnerNotify, now = new Date()) {
  const cursor = getSetting(database, DESIGNS_CURSOR_KEY)
  if (cursor === null) {
    const latest = database
      .prepare("SELECT MAX(updated_at) AS latest FROM automation_jobs WHERE status = 'PENDING_APPROVAL'")
      .get() as { latest: string | null }
    setSetting(database, DESIGNS_CURSOR_KEY, latest.latest || now.toISOString())
    return null
  }

  const batch = database.prepare(`
    SELECT COUNT(*) AS count, MAX(updated_at) AS latest FROM automation_jobs
    WHERE status = 'PENDING_APPROVAL' AND updated_at > ?
  `).get(cursor) as { count: number; latest: string | null }
  if (!batch.count || !batch.latest) return null
  if (now.getTime() - Date.parse(batch.latest) < DESIGN_BATCH_SETTLE_MS) return null

  const total = (database
    .prepare("SELECT COUNT(*) AS count FROM automation_jobs WHERE status = 'PENDING_APPROVAL'")
    .get() as { count: number }).count
  setSetting(database, DESIGNS_CURSOR_KEY, batch.latest)

  const notification = {
    title: batch.count === 1 ? "1 diseño nuevo para aprobar" : `${batch.count} diseños nuevos para aprobar`,
    body: total > batch.count
      ? `Hay ${total} pendientes en total. Apruébalos hoy para que Automaty los produzca mañana.`
      : "Apruébalos hoy para que Automaty los produzca mañana.",
    url: "/automation",
    tag: "designs-pending",
  }
  await notify(notification).catch(() => {})
  return notification
}

export type AgentLifecycleEvent = "started" | "shutdown" | "manual"

export type AgentSessionSummary = {
  produced?: number
  needsAttention?: number
  reason?: "idle_after_work" | "no_work"
}

export function parseAgentLifecycle(body: unknown): { event: AgentLifecycleEvent; summary: AgentSessionSummary } | null {
  if (!body || typeof body !== "object") return null
  const { event, summary } = body as { event?: unknown; summary?: unknown }
  if (event !== "started" && event !== "shutdown" && event !== "manual") return null
  const raw = summary && typeof summary === "object" ? summary as Record<string, unknown> : {}
  const count = (value: unknown) => Math.max(0, Math.min(10_000, Math.floor(Number(value) || 0)))
  return {
    event,
    summary: {
      produced: count(raw.produced),
      needsAttention: count(raw.needsAttention),
      reason: raw.reason === "no_work" ? "no_work" : raw.reason === "idle_after_work" ? "idle_after_work" : undefined,
    },
  }
}

/** Aviso de encendido (no en reinicios del agente) y de apagado con el resumen de la sesión. */
export async function alertAgentLifecycle(
  database: Database.Database,
  notify: OwnerNotify,
  input: {
    agentName: string
    event: AgentLifecycleEvent
    summary: AgentSessionSummary
    previousLastSeenAt: string | null
    now?: Date
  }
) {
  const now = input.now || new Date()
  let notification: { title: string; body: string; url: string; tag: string } | null = null

  if (input.event === "manual") {
    notification = {
      title: `${input.agentName} en modo manual`,
      body: "Lo estás usando tú: hoy no producirá ni se apagará solo.",
      url: "/automation",
      tag: "automaty-power",
    }
  } else if (input.event === "started") {
    const previous = input.previousLastSeenAt ? Date.parse(input.previousLastSeenAt) : NaN
    if (Number.isFinite(previous) && now.getTime() - previous < AGENT_RESTART_GRACE_MS) return null
    const queued = (database.prepare(`
      SELECT COUNT(*) AS count FROM automation_jobs WHERE status IN (${LOCAL_QUEUE_STATUSES.map(() => "?").join(", ")})
    `).get(...LOCAL_QUEUE_STATUSES) as { count: number }).count
    const paused = (database.prepare("SELECT setting_value FROM automation_settings WHERE setting_key = 'production_pipeline_mode'")
      .get() as { setting_value: string } | undefined)?.setting_value === "PAUSED"
    notification = {
      title: `${input.agentName} encendido`,
      body: queued && paused
        ? `${plural(queued, "diseño", "diseños")} en cola, pero la producción está EN PAUSA: no producirá nada. Revisa la incidencia y pulsa «Reanudar producción» en Automation.`
        : queued
          ? `${plural(queued, "diseño", "diseños")} en cola para producir.`
          : "No hay diseños en cola; se apagará en 30 minutos.",
      url: "/automation",
      tag: "automaty-power",
    }
  } else {
    const produced = input.summary.produced || 0
    const attention = input.summary.needsAttention || 0
    const parts = input.summary.reason === "no_work" && !produced && !attention
      ? ["No hubo trabajo hoy."]
      : [`Produjo ${plural(produced, "listing", "listings")}.`]
    if (attention) parts.push(`${plural(attention, "listing necesita", "listings necesitan")} atención.`)
    notification = {
      title: `${input.agentName} se apaga`,
      body: parts.join(" "),
      url: "/automation",
      tag: "automaty-power",
    }
  }

  await notify(notification).catch(() => {})
  return notification
}

/** Sin latido de Automaty durante este tiempo con un listing a medias = posible caída. */
export const STALLED_LOCAL_JOB_MS = 15 * 60_000

/** A medias de verdad. LOCAL_CLAIMED es solo "en la cola de Automaty, sin empezar": no cuenta. */
const LOCAL_IN_PROGRESS = ["LOCAL_BUILDING", "LOCAL_VALIDATING", "LOCAL_UPLOADING"]

/**
 * Vigilante: listings a medias en Automaty cuyo agente lleva STALLED_LOCAL_JOB_MS sin
 * latido (PC apagado, sin red o agente caído). Un solo aviso para todos, y nunca dos
 * veces por el mismo listing; el estado no cambia, para que el agente lo retome al volver.
 */
export async function alertStalledLocalJobs(database: Database.Database, notify: OwnerNotify, now = new Date()) {
  const cutoff = new Date(now.getTime() - STALLED_LOCAL_JOB_MS).toISOString()
  const stalled = database.prepare(`
    SELECT j.id, j.product_code AS productCode
    FROM automation_jobs j
    LEFT JOIN automation_agents a ON a.id = j.local_agent_id
    WHERE j.status IN (${LOCAL_IN_PROGRESS.map(() => "?").join(", ")})
      AND j.updated_at < ?
      AND (a.last_seen_at IS NULL OR a.last_seen_at < ?)
      AND NOT EXISTS (
        SELECT 1 FROM automation_job_events e
        WHERE e.job_id = j.id AND e.event_type = 'STALLED_ALERT' AND e.created_at > j.updated_at
      )
  `).all(...LOCAL_IN_PROGRESS, cutoff, cutoff) as Array<{ id: string; productCode: string }>
  if (!stalled.length) return []

  const record = database.prepare(`
    INSERT INTO automation_job_events (job_id, event_type, message, created_at)
    VALUES (?, 'STALLED_ALERT', ?, ?)
  `)
  for (const job of stalled) record.run(job.id, "Automaty dejó de responder con este listing a medias.", now.toISOString())
  await notify({
    title: "Automaty dejó de responder",
    body: `${stalled.length === 1 ? stalled[0].productCode : `${stalled.length} listings`} a medias. Si no vuelve solo, reinícialo desde Automation.`,
    url: "/automation",
    tag: "automaty-stalled",
  }).catch(() => {})
  return stalled.map((job) => job.productCode)
}

const DRAFTS_READY_CURSOR_KEY = "alerts.drafts_ready_cursor"
/** Se espera a que dejen de llegar drafts antes de avisar (un aviso por tanda, no por listing). */
export const DRAFTS_READY_SETTLE_MS = 10 * 60_000

/**
 * Un aviso por tanda de drafts que pasan a esperar tu revisión en Etsy, cuando la
 * tanda lleva DRAFTS_READY_SETTLE_MS sin crecer. La primera vez solo fija el cursor.
 */
export async function alertDraftsReady(database: Database.Database, notify: OwnerNotify, now = new Date()) {
  const cursor = getSetting(database, DRAFTS_READY_CURSOR_KEY)
  if (cursor === null) {
    setSetting(database, DRAFTS_READY_CURSOR_KEY, now.toISOString())
    return null
  }
  const batch = database.prepare(`
    SELECT COUNT(DISTINCT job_id) AS count, MAX(created_at) AS latest FROM automation_job_events
    WHERE event_type = 'STATUS_CHANGED' AND to_status = 'WAITING_ETSY_REVIEW' AND created_at > ?
  `).get(cursor) as { count: number; latest: string | null }
  if (!batch.count || !batch.latest) return null
  if (now.getTime() - Date.parse(batch.latest) < DRAFTS_READY_SETTLE_MS) return null
  setSetting(database, DRAFTS_READY_CURSOR_KEY, batch.latest)

  const total = (database
    .prepare("SELECT COUNT(*) AS count FROM automation_jobs WHERE status = 'WAITING_ETSY_REVIEW'")
    .get() as { count: number }).count
  if (!total) return null
  const notification = {
    title: batch.count === 1 ? "1 draft nuevo en Etsy" : `${batch.count} drafts nuevos en Etsy`,
    body: `${plural(total, "draft espera", "drafts esperan")} tu revisión.`,
    url: "/automation",
    tag: "drafts-ready",
  }
  await notify(notification).catch(() => {})
  return notification
}

/**
 * Aviso al pasar del 70 % del cupo diario de llamadas a Etsy (E1), una vez al día.
 * `usedFraction` sale de las cabeceras de Etsy (null si aún no hay datos).
 */
export async function alertEtsyQuota(
  database: Database.Database,
  notify: OwnerNotify,
  usage: { day: string; usedFraction: number | null; dailyLimit: number | null; remainingToday: number | null }
) {
  if (usage.usedFraction == null || usage.usedFraction < 0.7) return false
  const key = "alerts.etsy_quota_day"
  const row = database.prepare("SELECT setting_value FROM automation_settings WHERE setting_key = ?").get(key) as { setting_value: string } | undefined
  if (row?.setting_value === usage.day) return false
  database.prepare(`
    INSERT INTO automation_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at
  `).run(key, usage.day, new Date().toISOString())
  await notify({
    title: "Llamadas a Etsy: más del 70 % de hoy",
    body: `Quedan ${usage.remainingToday ?? "?"} de ${usage.dailyLimit ?? "?"} llamadas. La producción sigue; conviene no lanzar tareas grandes hoy.`,
    url: "/dashboard",
    tag: "etsy-quota",
  }).catch(() => {})
  return true
}
