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
    url: "/?section=automation",
    tag: "designs-pending",
  }
  await notify(notification).catch(() => {})
  return notification
}

export type AgentLifecycleEvent = "started" | "shutdown"

export type AgentSessionSummary = {
  produced?: number
  needsAttention?: number
  reason?: "idle_after_work" | "no_work"
}

export function parseAgentLifecycle(body: unknown): { event: AgentLifecycleEvent; summary: AgentSessionSummary } | null {
  if (!body || typeof body !== "object") return null
  const { event, summary } = body as { event?: unknown; summary?: unknown }
  if (event !== "started" && event !== "shutdown") return null
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

  if (input.event === "started") {
    const previous = input.previousLastSeenAt ? Date.parse(input.previousLastSeenAt) : NaN
    if (Number.isFinite(previous) && now.getTime() - previous < AGENT_RESTART_GRACE_MS) return null
    const queued = (database.prepare(`
      SELECT COUNT(*) AS count FROM automation_jobs WHERE status IN (${LOCAL_QUEUE_STATUSES.map(() => "?").join(", ")})
    `).get(...LOCAL_QUEUE_STATUSES) as { count: number }).count
    notification = {
      title: `${input.agentName} encendido`,
      body: queued
        ? `${plural(queued, "diseño", "diseños")} en cola para producir.`
        : "No hay diseños en cola; se apagará en 30 minutos.",
      url: "/?section=automation",
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
      url: "/?section=automation",
      tag: "automaty-power",
    }
  }

  await notify(notification).catch(() => {})
  return notification
}

/** Sin latido de Automaty durante este tiempo con un listing a medias = posible caída. */
export const STALLED_LOCAL_JOB_MS = 15 * 60_000

/**
 * Vigilante: listings en producción local cuyo agente lleva STALLED_LOCAL_JOB_MS sin
 * latido (PC apagado, sin red o agente caído). Avisa una sola vez por listing; el
 * estado no cambia, para que el agente pueda retomarlo al volver.
 */
export async function alertStalledLocalJobs(database: Database.Database, notify: OwnerNotify, now = new Date()) {
  const cutoff = new Date(now.getTime() - STALLED_LOCAL_JOB_MS).toISOString()
  const stalled = database.prepare(`
    SELECT j.id, j.product_code AS productCode, a.last_seen_at AS lastSeenAt
    FROM automation_jobs j
    LEFT JOIN automation_agents a ON a.id = j.local_agent_id
    WHERE j.status IN (${LOCAL_QUEUE_STATUSES.filter((status) => status !== "QUEUED_LOCAL").map(() => "?").join(", ")})
      AND j.updated_at < ?
      AND (a.last_seen_at IS NULL OR a.last_seen_at < ?)
      AND NOT EXISTS (
        SELECT 1 FROM automation_job_events e
        WHERE e.job_id = j.id AND e.event_type = 'STALLED_ALERT' AND e.created_at > j.updated_at
      )
  `).all(...LOCAL_QUEUE_STATUSES.filter((status) => status !== "QUEUED_LOCAL"), cutoff, cutoff) as Array<{ id: string; productCode: string; lastSeenAt: string | null }>

  for (const job of stalled) {
    database.prepare(`
      INSERT INTO automation_job_events (job_id, event_type, message, created_at)
      VALUES (?, 'STALLED_ALERT', ?, ?)
    `).run(job.id, "Automaty dejó de responder con este listing a medias.", now.toISOString())
    await notify({
      title: `${job.productCode} parado en Automaty`,
      body: "Automaty dejó de responder a mitad de la producción. Si no vuelve solo, reinícialo desde Automation.",
      url: "/?section=automation",
      tag: `stalled-${job.productCode}`,
    }).catch(() => {})
  }
  return stalled.map((job) => job.productCode)
}
