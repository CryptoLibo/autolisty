import { randomUUID } from "node:crypto"
import type Database from "better-sqlite3"

export type AluraUsage = { plan: string; credits: { allowance: number; used: number; remaining: number };
  daily: { limit: number; used: number } | null; rate_limit: { requests_per_minute: number };
  costs?: Record<string, number> }

export async function fetchAluraUsage(key: string, fetcher: typeof fetch = fetch) {
  const started = Date.now()
  let response: Response
  try {
    response = await fetcher("https://api.alura.io/v1/usage", {
      headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(10000),
    })
  } catch {
    return { state: "UNAVAILABLE" as const, httpStatus: null, latencyMs: Date.now() - started,
      usage: null, creditsCost: null, errorCode: "connection_failed" }
  }
  const rawCreditsCost = response.headers.get("Alura-Credits-Cost")
  const creditsCost = rawCreditsCost === null ? null : Number(rawCreditsCost)
  const base = { httpStatus: response.status, latencyMs: Date.now() - started,
    creditsCost: creditsCost !== null && Number.isFinite(creditsCost) ? creditsCost : null }
  if (!response.ok) return { ...base, state: response.status === 401 || response.status === 403
    ? "NOT_AUTHORIZED" as const : "DEGRADED" as const, usage: null,
    errorCode: `http_${response.status}` }
  try {
    const usage = await response.json() as AluraUsage
    if (!Number.isSafeInteger(usage.credits?.remaining) || usage.credits.remaining < 0 ||
      !Number.isSafeInteger(usage.credits?.allowance) || !Number.isSafeInteger(usage.credits?.used) ||
      typeof usage.plan !== "string" || !Number.isSafeInteger(usage.rate_limit?.requests_per_minute)) {
      throw new Error("Invalid usage response")
    }
    return { ...base, state: "AVAILABLE" as const, usage, errorCode: null }
  } catch {
    return { ...base, state: "DEGRADED" as const, usage: null, errorCode: "invalid_usage_response" }
  }
}

export function recordAluraDiagnostic(db: Database.Database, result: Awaited<ReturnType<typeof fetchAluraUsage>>) {
  const usage = result.usage
  db.prepare(`INSERT INTO research_alura_diagnostics
    (id,checked_at,state,http_status,latency_ms,plan,credits_remaining,credits_cost,rate_limit,error_code)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(), new Date().toISOString(), result.state,
    result.httpStatus, result.latencyMs, usage?.plan || null, usage?.credits.remaining ?? null,
    result.creditsCost, usage?.rate_limit.requests_per_minute ?? null, result.errorCode)
}
