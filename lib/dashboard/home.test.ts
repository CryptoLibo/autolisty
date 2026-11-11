import { describe, expect, it } from "vitest"
import { openAutomationDatabase } from "../automation/db/database"
import { AutomationRepository } from "../automation/repository"
import { getDashboardHome, isSeasonalTitle } from "./home"

describe("dashboard home", () => {
  it("embudo y publicados salen de los eventos reales de Automation", () => {
    const db = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(db)
    const now = new Date(Date.now() + 60_000)
    const yesterday = new Date(Date.now() - 86_400_000).toISOString()
    const a = repository.createJob({ productType: "frame_tv_art", sourcePrompt: "a" })
    const b = repository.createJob({ productType: "frame_tv_art", sourcePrompt: "b" })
    repository.createJob({ productType: "frame_tv_art", sourcePrompt: "c" })
    const event = db.prepare("INSERT INTO automation_job_events (job_id, event_type, to_status, created_at) VALUES (?, 'TEST', ?, ?)")
    for (const status of ["QUEUED_LOCAL", "LOCAL_COMPLETE", "ETSY_ACTIVE"]) event.run(a.id, status, yesterday)
    event.run(b.id, "QUEUED_LOCAL", yesterday)

    const home = getDashboardHome(db, "7d", { etsyConnected: false, etsySalesAuthorized: false }, now)
    expect(home.funnel).toMatchObject({ submitted: 3, approved: 2, produced: 1, published: 1, withSales: 0 })
    expect(home.kpis.published.current).toBe(1)
    expect(home.kpis.published.spark).toHaveLength(7)
    // Sin Etsy conectado no se inventan ventas.
    expect(home.kpis.revenue.current).toBeNull()
    expect(home.top).toEqual([])
  })

  it("marca los listings estacionales por su título", () => {
    expect(isSeasonalTitle("Rustic Christmas Barn Horizontal Print")).toBe(true)
    expect(isSeasonalTitle("Autumn Vineyard Frame TV Art")).toBe(true)
    expect(isSeasonalTitle("Coastal Lighthouse Vertical Print")).toBe(false)
  })
})
