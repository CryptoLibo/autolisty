import type Database from "better-sqlite3"
import type { MarketConnector } from "./contracts"

export type DiagnosticState = "NOT_CONFIGURED" | "NOT_AUTHORIZED" | "AVAILABLE" | "DEGRADED" | "UNAVAILABLE"

export function marketDiagnostics(db: Database.Database, connectors: MarketConnector[]) {
  return connectors.map((connector) => {
    const configuration = connector.status()
    const probe = connector.provider === "alura" ? db.prepare(`SELECT state,checked_at,error_code FROM research_alura_diagnostics
      ORDER BY checked_at DESC LIMIT 1`).get() as { state: DiagnosticState; checked_at: string; error_code: string | null } | undefined : undefined
    const last = db.prepare(`SELECT q.status,q.captured_at FROM research_queries q
      WHERE q.provider=? ORDER BY q.captured_at DESC LIMIT 1`).get(connector.provider) as
      { status: string; captured_at: string } | undefined
    let state: DiagnosticState
    if (configuration.state === "DISABLED") state = "UNAVAILABLE"
    else if (configuration.state === "NOT_AUTHORIZED") {
      state = /missing|not configured|credentials/i.test(configuration.reason || "") ? "NOT_CONFIGURED" : "NOT_AUTHORIZED"
    } else if (configuration.state === "UNAVAILABLE") state = "UNAVAILABLE"
    else if (probe) state = probe.state === "AVAILABLE" && last?.status !== "COMPLETED"
      ? "NOT_AUTHORIZED" : probe.state
    else if (!last) state = "NOT_AUTHORIZED"
    else state = last.status === "COMPLETED" ? "AVAILABLE" : "DEGRADED"
    return { provider: connector.provider, state, configured: configuration.state === "AVAILABLE",
      capabilities: configuration.capabilities, lastCheckAt: probe?.checked_at || last?.captured_at || null,
      errorCode: probe?.error_code || null,
      reason: state === "NOT_AUTHORIZED" && configuration.state === "AVAILABLE"
        ? probe?.state === "AVAILABLE" ? "Usage access verified; research scope is not yet verified."
          : "Credentials configured; no successful authorized research call has been recorded."
        : configuration.reason || null }
  })
}
