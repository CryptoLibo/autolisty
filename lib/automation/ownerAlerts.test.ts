import { describe, expect, it, vi } from "vitest"
import { openAutomationDatabase } from "./db/database"
import { AutomationRepository } from "./repository"
import { alertAgentLifecycle, alertNewPendingDesigns, alertStalledLocalJobs, parseAgentLifecycle } from "./ownerAlerts"

function setup() {
  const database = openAutomationDatabase(":memory:")
  const repository = new AutomationRepository(database)
  const notify = vi.fn(async () => {})
  return { database, repository, notify }
}

function pendingJob(repository: AutomationRepository, database: ReturnType<typeof openAutomationDatabase>, updatedAt: string) {
  const job = repository.createJob({ productType: "frame_tv_art", sourcePrompt: "Snowy village" })
  database.prepare("UPDATE automation_jobs SET status = 'PENDING_APPROVAL', updated_at = ? WHERE id = ?").run(updatedAt, job.id)
  return job
}

describe("alertNewPendingDesigns", () => {
  it("fija el cursor la primera vez sin avisar de lo que ya estaba pendiente", async () => {
    const { database, repository, notify } = setup()
    pendingJob(repository, database, "2026-11-08T10:00:00.000Z")
    expect(await alertNewPendingDesigns(database, notify, new Date("2026-11-08T12:00:00.000Z"))).toBeNull()
    expect(notify).not.toHaveBeenCalled()
  })

  it("avisa una vez por lote cuando deja de crecer", async () => {
    const { database, repository, notify } = setup()
    await alertNewPendingDesigns(database, notify, new Date("2026-11-08T12:00:00.000Z"))
    pendingJob(repository, database, "2026-11-08T13:00:00.000Z")
    pendingJob(repository, database, "2026-11-08T13:02:00.000Z")

    // El lote aún está llegando.
    expect(await alertNewPendingDesigns(database, notify, new Date("2026-11-08T13:04:00.000Z"))).toBeNull()

    const alert = await alertNewPendingDesigns(database, notify, new Date("2026-11-08T13:08:00.000Z"))
    expect(alert?.title).toBe("2 diseños nuevos para aprobar")
    expect(notify).toHaveBeenCalledTimes(1)

    // Sin diseños nuevos no vuelve a avisar.
    expect(await alertNewPendingDesigns(database, notify, new Date("2026-11-08T14:00:00.000Z"))).toBeNull()

    pendingJob(repository, database, "2026-11-08T15:00:00.000Z")
    const next = await alertNewPendingDesigns(database, notify, new Date("2026-11-08T15:10:00.000Z"))
    expect(next?.title).toBe("1 diseño nuevo para aprobar")
    expect(next?.body).toContain("Hay 3 pendientes en total")
  })
})

describe("alertAgentLifecycle", () => {
  it("avisa del encendido con la cola, pero no en un reinicio del agente", async () => {
    const { database, repository, notify } = setup()
    const job = repository.createJob({ productType: "frame_tv_art", sourcePrompt: "Snowy village" })
    database.prepare("UPDATE automation_jobs SET status = 'QUEUED_LOCAL' WHERE id = ?").run(job.id)
    const now = new Date("2026-11-09T09:02:00.000Z")

    const started = await alertAgentLifecycle(database, notify, {
      agentName: "Automaty", event: "started", summary: {}, previousLastSeenAt: "2026-11-08T10:30:00.000Z", now,
    })
    expect(started?.title).toBe("Automaty encendido")
    expect(started?.body).toBe("1 diseño en cola para producir.")

    const restart = await alertAgentLifecycle(database, notify, {
      agentName: "Automaty", event: "started", summary: {}, previousLastSeenAt: "2026-11-09T09:00:00.000Z", now,
    })
    expect(restart).toBeNull()
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it("resume la sesión al apagar", async () => {
    const { database, notify } = setup()
    const worked = await alertAgentLifecycle(database, notify, {
      agentName: "Automaty", event: "shutdown", summary: { produced: 9, needsAttention: 1, reason: "idle_after_work" }, previousLastSeenAt: null,
    })
    expect(worked?.body).toBe("Produjo 9 listings. 1 listing necesita atención.")

    const idle = await alertAgentLifecycle(database, notify, {
      agentName: "Automaty", event: "shutdown", summary: { produced: 0, needsAttention: 0, reason: "no_work" }, previousLastSeenAt: null,
    })
    expect(idle?.body).toBe("No hubo trabajo hoy.")
  })

  it("ignora eventos desconocidos y limpia el resumen", () => {
    expect(parseAgentLifecycle({ event: "reboot" })).toBeNull()
    expect(parseAgentLifecycle({ name: "Automaty" })).toBeNull()
    expect(parseAgentLifecycle({ event: "shutdown", summary: { produced: "4", needsAttention: -2, reason: "x" } }))
      .toEqual({ event: "shutdown", summary: { produced: 4, needsAttention: 0, reason: undefined } })
  })
})

describe("alertStalledLocalJobs", () => {
  it("avisa una vez si Automaty deja de latir con un listing a medias", async () => {
    const { database, repository, notify } = setup()
    database.prepare("INSERT INTO automation_agents (id, name, status, last_seen_at, created_at, updated_at) VALUES ('agent-1', 'Automaty', 'ONLINE', ?, ?, ?)")
      .run("2026-11-11T09:10:00.000Z", "2026-11-11T09:00:00.000Z", "2026-11-11T09:10:00.000Z")
    const job = repository.createJob({ productType: "frame_tv_art", sourcePrompt: "Snowy village" })
    database.prepare("UPDATE automation_jobs SET status = 'LOCAL_BUILDING', local_agent_id = 'agent-1', updated_at = ? WHERE id = ?")
      .run("2026-11-11T09:05:00.000Z", job.id)

    // Agente aún vivo: nada.
    expect(await alertStalledLocalJobs(database, notify, new Date("2026-11-11T09:15:00.000Z"))).toEqual([])

    const stalled = await alertStalledLocalJobs(database, notify, new Date("2026-11-11T09:40:00.000Z"))
    expect(stalled).toEqual([job.productCode])
    expect(notify).toHaveBeenCalledTimes(1)

    // No repite el aviso.
    expect(await alertStalledLocalJobs(database, notify, new Date("2026-11-11T10:40:00.000Z"))).toEqual([])
    expect(notify).toHaveBeenCalledTimes(1)
  })
})

describe("cupo de Etsy", () => {
  it("avisa una sola vez al día al pasar del 70 %", async () => {
    const { openAutomationDatabase } = await import("./db/database")
    const { alertEtsyQuota } = await import("./ownerAlerts")
    const db = openAutomationDatabase(":memory:")
    const notify = vi.fn(async () => {})
    const usage = { day: "2026-11-14", usedFraction: 0.75, dailyLimit: 10000, remainingToday: 2500 }
    expect(await alertEtsyQuota(db, notify, usage)).toBe(true)
    expect(await alertEtsyQuota(db, notify, usage)).toBe(false)
    expect(await alertEtsyQuota(db, notify, { ...usage, usedFraction: 0.5, day: "2026-11-15" })).toBe(false)
    expect(notify).toHaveBeenCalledTimes(1)
  })
})
