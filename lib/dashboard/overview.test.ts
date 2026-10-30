import { afterEach, describe, expect, it } from "vitest"
import type Database from "better-sqlite3"
import { openAutomationDatabase } from "../automation/db/database"
import { getDashboardOverview, isDashboardPeriod } from "./overview"

describe("Dashboard Automation data", () => {
  let db: Database.Database
  afterEach(() => db?.close())

  it("validates the supported period values", () => {
    expect(isDashboardPeriod("7d")).toBe(true)
    expect(isDashboardPeriod("all")).toBe(false)
    expect(isDashboardPeriod("7d;DROP TABLE automation_jobs")).toBe(false)
  })

  it("reports only real jobs in the selected creation cohort", () => {
    db = openAutomationDatabase(":memory:")
    const insert = db.prepare(`INSERT INTO automation_jobs
      (id,product_code,product_type,source_prompt,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
    insert.run("old", "LBCreaStudio-OLD001", "png_designs", "test", "COMPLETED",
      "2026-09-01T10:00:00.000Z", "2026-09-01T10:00:00.000Z")
    insert.run("new", "LBCreaStudio-NEW001", "png_designs", "test", "NEEDS_ATTENTION",
      "2026-10-29T10:00:00.000Z", "2026-10-29T10:00:00.000Z")
    const result = getDashboardOverview(db, "7d", new Date("2026-10-30T12:00:00.000Z"))
    expect(result).toMatchObject({ total: 1, attention: 1, completed: 0, active: 0, canceled: 0 })
    expect(result.trend).toHaveLength(7)
    expect(result.trend.reduce((sum, point) => sum + point.count, 0)).toBe(1)
    expect(result.recent.map((item) => item.productCode)).toEqual(["LBCreaStudio-NEW001"])
    expect(getDashboardOverview(db, "90d", new Date("2026-10-30T12:00:00.000Z")).total).toBe(2)
  })
})
