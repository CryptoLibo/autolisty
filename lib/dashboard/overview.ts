import type Database from "better-sqlite3"

export type DashboardPeriod = "7d" | "30d" | "90d"
export type DashboardOverview = {
  source: "automation"
  period: DashboardPeriod
  from: string
  asOf: string
  total: number
  active: number
  completed: number
  attention: number
  canceled: number
  byStatus: Record<string, number>
  trend: Array<{ date: string; count: number }>
  recent: Array<{ id: string; productCode: string; status: string; createdAt: string }>
}

const PERIOD_DAYS: Record<DashboardPeriod, number> = { "7d": 7, "30d": 30, "90d": 90 }

export function isDashboardPeriod(value: string | null): value is DashboardPeriod {
  return value !== null && Object.hasOwn(PERIOD_DAYS, value)
}

export function getDashboardOverview(db: Database.Database, period: DashboardPeriod, now = new Date()): DashboardOverview {
  const days = PERIOD_DAYS[period]
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days + 1))
  const from = start.toISOString()
  const asOf = now.toISOString()
  const rows = db.prepare(`SELECT status, COUNT(*) AS count FROM automation_jobs
    WHERE created_at >= ? AND created_at <= ? GROUP BY status`).all(from, asOf) as Array<{ status: string; count: number }>
  const byStatus = Object.fromEntries(rows.map((row) => [row.status, row.count]))
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  const completed = byStatus.COMPLETED || 0
  const canceled = byStatus.CANCELED || 0
  const attention = byStatus.NEEDS_ATTENTION || 0
  const daily = db.prepare(`SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS count FROM automation_jobs
    WHERE created_at >= ? AND created_at <= ? GROUP BY substr(created_at, 1, 10)`).all(from, asOf) as
    Array<{ date: string; count: number }>
  const byDay = new Map(daily.map((row) => [row.date, row.count]))
  const trend: DashboardOverview["trend"] = []
  const interval = period === "90d" ? 7 : 1
  for (let offset = 0; offset < days; offset += interval) {
    const bucketStart = new Date(start)
    bucketStart.setUTCDate(start.getUTCDate() + offset)
    let count = 0
    for (let day = offset; day < Math.min(offset + interval, days); day++) {
      const date = new Date(start)
      date.setUTCDate(start.getUTCDate() + day)
      count += byDay.get(date.toISOString().slice(0, 10)) || 0
    }
    trend.push({ date: bucketStart.toISOString().slice(0, 10), count })
  }
  const recent = db.prepare(`SELECT id, product_code AS productCode, status, created_at AS createdAt
    FROM automation_jobs WHERE created_at >= ? AND created_at <= ?
    ORDER BY created_at DESC LIMIT 5`).all(from, asOf) as DashboardOverview["recent"]

  return { source: "automation", period, from, asOf, total, active: total - completed - canceled - attention,
    completed, attention, canceled, byStatus, trend, recent }
}
