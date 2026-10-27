import path from "node:path"
import Database from "better-sqlite3"
import { runResearchRetention } from "./research-retention.mjs"

const databasePath = process.env.AUTOMATION_DB_PATH || path.join(process.cwd(), "data", "autolisty-automation.sqlite")
if (!path.isAbsolute(databasePath)) throw new Error("AUTOMATION_DB_PATH must be absolute.")
if (!process.argv.includes("--once") && !process.argv.includes("--loop")) {
  throw new Error("Specify --once or --loop.")
}

async function run() {
  const db = new Database(databasePath, { fileMustExist: true })
  try {
    db.pragma("foreign_keys = ON")
    db.pragma("busy_timeout = 5000")
    const version = Number(db.pragma("user_version", { simple: true }))
    if (version < 10) throw new Error("Research schema v10 is required; maintenance never runs migrations.")
    const previous = db.prepare(`SELECT finished_at FROM research_maintenance_log
      WHERE status='COMPLETED' AND origin='worker' ORDER BY finished_at DESC LIMIT 1`).get()
    const missedIntervals = previous ? Math.max(0, Math.floor((Date.now() - Date.parse(previous.finished_at)) / 300000) - 1) : null
    const result = runResearchRetention(db, new Date(), "worker")
    const recovered = db.transaction(() => {
      const now = new Date().toISOString()
      const runs = db.prepare(`SELECT id,plan_json FROM research_runs WHERE status='RUNNING'
        AND lease_expires_at<=? AND lease_owner IS NOT NULL`).all(now)
      let ready = 0, review = 0
      for (const run of runs) {
        const uncertain = db.prepare(`SELECT id FROM research_call_ledger WHERE run_id=? AND state IN ('IN_FLIGHT','UNKNOWN')`).all(run.id)
        for (const call of uncertain) db.prepare("UPDATE research_call_ledger SET state='UNKNOWN',updated_at=? WHERE id=?").run(now, call.id)
        const needsReview = uncertain.length > 0 || run.plan_json === "{}"
        db.prepare(`UPDATE research_runs SET lease_owner=NULL,lease_expires_at=NULL,
          recovery_state=?,last_recovery_at=?,updated_at=? WHERE id=?`)
          .run(needsReview ? "NEEDS_REVIEW" : "READY", now, now, run.id)
        if (needsReview) review++
        else ready++
      }
      return { ready, review }
    })()
    process.stdout.write(JSON.stringify({ status: result.status, counts: result.counts, recovered, missedIntervals }) + "\n")
  } finally { db.close() }
}

await run()
if (process.argv.includes("--loop")) {
  let running = false
  const timer = setInterval(() => {
    if (running) { process.stderr.write("Research maintenance missed a tick because the prior pass is still running.\n"); return }
    running = true
    void run().catch((error) => {
      process.stderr.write(`Research maintenance failed: ${error instanceof Error ? error.message : "unknown"}\n`)
      process.exitCode = 1
      clearInterval(timer)
    }).finally(() => { running = false })
  }, 5 * 60 * 1000)
}
