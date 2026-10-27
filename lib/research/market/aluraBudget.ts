import type Database from "better-sqlite3"

export const ALURA_TEST_BUDGET = 30
export const ALURA_MIN_RESERVE = 40
const BUDGET_ID = "stage4_2_test"

export function maintenanceIsHealthy(db: Database.Database, now = new Date()) {
  const row = db.prepare(`SELECT finished_at FROM research_maintenance_log
    WHERE status='COMPLETED' AND origin='worker' ORDER BY finished_at DESC LIMIT 1`)
    .get() as { finished_at: string } | undefined
  return !!row && Number.isFinite(Date.parse(row.finished_at)) &&
    now.getTime() - Date.parse(row.finished_at) >= 0 && now.getTime() - Date.parse(row.finished_at) < 10 * 60 * 1000
}

export function reserveAluraCredits(db: Database.Database, callId: string, cost: number, remaining: number, now = new Date()) {
  if (!Number.isSafeInteger(cost) || cost < 1 || !Number.isSafeInteger(remaining) || remaining < 0) {
    throw new Error("Alura credit estimate or balance is unknown.")
  }
  return db.transaction(() => {
    if (!maintenanceIsHealthy(db, now)) throw new Error("Alura retention maintenance is not healthy; call blocked.")
    const call = db.prepare("SELECT state,reserved_credits FROM research_call_ledger WHERE id=?")
      .get(callId) as { state: string; reserved_credits: number } | undefined
    if (call?.state !== "PREPARED" || call.reserved_credits) throw new Error("Alura call is not eligible for a new reservation.")
    const current = db.prepare("SELECT spent_credits,reserved_credits FROM research_alura_budget WHERE month=?")
      .get(BUDGET_ID) as { spent_credits: number; reserved_credits: number } | undefined
    const spent = current?.spent_credits || 0, reserved = current?.reserved_credits || 0
    if (spent + reserved + cost > ALURA_TEST_BUDGET) throw new Error("Alura test budget of 30 credits would be exceeded.")
    if (remaining - reserved - cost < ALURA_MIN_RESERVE) throw new Error("Alura 40-credit reserve would be breached.")
    db.prepare(`INSERT INTO research_alura_budget (month,spent_credits,reserved_credits,updated_at)
      VALUES (?,?,?,?) ON CONFLICT(month) DO UPDATE SET reserved_credits=excluded.reserved_credits,
      updated_at=excluded.updated_at`).run(BUDGET_ID, spent, reserved + cost, now.toISOString())
    db.prepare("UPDATE research_call_ledger SET reserved_credits=? WHERE id=?").run(cost, callId)
    return { spent, reserved: reserved + cost, remainingAfterCall: remaining - reserved - cost }
  })()
}

export function settleAluraCredits(db: Database.Database, callId: string, reportedCost: number | undefined, now = new Date()) {
  return db.transaction(() => {
    const call = db.prepare("SELECT reserved_credits,state FROM research_call_ledger WHERE id=?")
      .get(callId) as { reserved_credits: number; state: string } | undefined
    if (!call || call.state !== "COMPLETED" || !call.reserved_credits) return
    const charged = Number.isSafeInteger(reportedCost) && reportedCost! >= 0 ? reportedCost! : call.reserved_credits
    const budget = db.prepare("SELECT spent_credits,reserved_credits FROM research_alura_budget WHERE month=?")
      .get(BUDGET_ID) as { spent_credits: number; reserved_credits: number }
    db.prepare("UPDATE research_alura_budget SET spent_credits=?,reserved_credits=?,updated_at=? WHERE month=?")
      .run(budget.spent_credits + charged, budget.reserved_credits - call.reserved_credits, now.toISOString(), BUDGET_ID)
    db.prepare("UPDATE research_call_ledger SET reserved_credits=0 WHERE id=?").run(callId)
  })()
}

export function aluraBudgetStatus(db: Database.Database) {
  const row = db.prepare("SELECT spent_credits,reserved_credits FROM research_alura_budget WHERE month=?")
    .get(BUDGET_ID) as { spent_credits: number; reserved_credits: number } | undefined
  return { maximum: ALURA_TEST_BUDGET, minimumReserve: ALURA_MIN_RESERVE,
    spent: row?.spent_credits || 0, reserved: row?.reserved_credits || 0, maintenanceHealthy: maintenanceIsHealthy(db) }
}
