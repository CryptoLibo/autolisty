import { createHash, randomUUID } from "node:crypto"
import type Database from "better-sqlite3"
import type { MarketMetric, MarketResult } from "./contracts"
import type { MarketPlan } from "./plan"
import { runResearchRetention } from "../../../scripts/research-retention.mjs"
import { getProviderPolicy, providerExpiry } from "./providerPolicies.mjs"

export class MarketResearchRepository {
  constructor(private readonly db: Database.Database) {}
  static hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex") }
  purgeExpired() {
    const last = this.db.prepare("SELECT finished_at FROM research_maintenance_log WHERE status='COMPLETED' ORDER BY finished_at DESC LIMIT 1")
      .get() as { finished_at: string } | undefined
    if (!last || Date.now() - Date.parse(last.finished_at) > 5 * 60 * 1000) runResearchRetention(this.db)
  }
  claim(investigationId: string, requestHash: string, owner: string) {
    return this.db.transaction(() => {
      const existing = this.db.prepare("SELECT id,status,recovery_state,lease_owner,lease_expires_at,plan_json FROM research_runs WHERE investigation_id=? AND request_hash=?")
        .get(investigationId, requestHash) as { id: string; status: string; recovery_state: string;
          lease_owner: string | null; lease_expires_at: string | null; plan_json: string } | undefined
      const now = new Date(), expires = new Date(now.getTime() + 120000).toISOString()
      if (existing) {
        if (existing.status !== "RUNNING") return { ...existing, claimed: false, reason: "finished" as const }
        if (existing.recovery_state === "NEEDS_REVIEW" || existing.recovery_state.startsWith("CANCEL")) {
          return { ...existing, claimed: false, reason: "review" as const }
        }
        if (existing.lease_owner && existing.lease_expires_at && existing.lease_expires_at > now.toISOString()) {
          return { ...existing, claimed: false, reason: "active" as const }
        }
        const unresolved = this.db.prepare(`SELECT 1 FROM research_call_ledger WHERE run_id=? AND state IN ('IN_FLIGHT','UNKNOWN') LIMIT 1`)
          .get(existing.id)
        if (unresolved || existing.plan_json === "{}") {
          this.db.prepare("UPDATE research_runs SET recovery_state='NEEDS_REVIEW',lease_owner=NULL,lease_expires_at=NULL,last_recovery_at=? WHERE id=?")
            .run(now.toISOString(), existing.id)
          return { ...existing, claimed: false, reason: "review" as const }
        }
        this.db.prepare(`UPDATE research_runs SET lease_owner=?,lease_expires_at=?,attempt_count=attempt_count+1,
          last_recovery_at=?,updated_at=? WHERE id=?`).run(owner, expires, now.toISOString(), now.toISOString(), existing.id)
        return { ...existing, claimed: true, resumed: true }
      }
      const id = randomUUID(), timestamp = now.toISOString()
      this.db.prepare(`INSERT INTO research_runs
        (id,investigation_id,request_hash,plan_json,status,started_at,updated_at,lease_owner,lease_expires_at,attempt_count)
        VALUES (?,?,?,'{}','RUNNING',?,?,?,?,1)`).run(id, investigationId, requestHash, timestamp, timestamp, owner, expires)
      return { id, status: "RUNNING", claimed: true, resumed: false, plan_json: "{}" }
    })()
  }

  savePlan(runId: string, owner: string, plan: MarketPlan) {
    const changed = this.db.prepare("UPDATE research_runs SET plan_json=?,updated_at=? WHERE id=? AND lease_owner=? AND status='RUNNING'")
      .run(JSON.stringify(plan), new Date().toISOString(), runId, owner).changes
    if (!changed) throw new Error("Research lease was lost before planning completed.")
  }

  recoverInterrupted(now = new Date()) {
    const timestamp = now.toISOString()
    return this.db.transaction(() => {
      const rows = this.db.prepare(`SELECT id,plan_json FROM research_runs WHERE status='RUNNING' AND lease_expires_at IS NOT NULL
        AND lease_expires_at<=? AND lease_owner IS NOT NULL`).all(timestamp) as Array<{ id: string; plan_json: string }>
      let ready = 0, review = 0
      for (const row of rows) {
        const uncertain = this.db.prepare("SELECT id FROM research_call_ledger WHERE run_id=? AND state IN ('IN_FLIGHT','UNKNOWN')")
          .all(row.id) as Array<{ id: string }>
        for (const call of uncertain) this.db.prepare("UPDATE research_call_ledger SET state='UNKNOWN',updated_at=? WHERE id=?")
          .run(timestamp, call.id)
        const needsReview = uncertain.length > 0 || row.plan_json === "{}"
        this.db.prepare(`UPDATE research_runs SET lease_owner=NULL,lease_expires_at=NULL,
          recovery_state=?,last_recovery_at=?,updated_at=? WHERE id=?`)
          .run(needsReview ? "NEEDS_REVIEW" : "READY", timestamp, timestamp, row.id)
        if (needsReview) review++
        else ready++
      }
      return { ready, review }
    })()
  }

  cancel(runId: string) {
    return this.db.transaction(() => {
      const row = this.db.prepare("SELECT status,recovery_state,lease_owner FROM research_runs WHERE id=?")
        .get(runId) as { status: string; recovery_state: string; lease_owner: string | null } | undefined
      if (!row) throw new Error("Research run not found.")
      if (row.status !== "RUNNING") return row.recovery_state
      const state = row.lease_owner ? "CANCEL_REQUESTED" : "CANCELLED"
      const now = new Date().toISOString()
      this.db.prepare(`UPDATE research_runs SET recovery_state=?,cancelled_at=?,updated_at=?,
        status=CASE WHEN ?='CANCELLED' THEN 'PARTIAL' ELSE status END WHERE id=?`)
        .run(state, now, now, state, runId)
      return state
    })()
  }

  markNeedsReview(runId: string, reason: string) {
    this.db.prepare(`UPDATE research_runs SET status='PARTIAL',recovery_state='NEEDS_REVIEW',lease_owner=NULL,
      lease_expires_at=NULL,error=?,updated_at=? WHERE id=? AND status='RUNNING'`)
      .run(reason.slice(0, 250), new Date().toISOString(), runId)
  }

  cancellationRequested(runId: string) {
    const row = this.db.prepare("SELECT recovery_state FROM research_runs WHERE id=?").get(runId) as { recovery_state: string } | undefined
    return row?.recovery_state === "CANCEL_REQUESTED" || row?.recovery_state === "CANCELLED"
  }

  prepareCall(input: { runId: string; owner: string; provider: string; capability: string; hash: string; query: unknown }) {
    return this.db.transaction(() => {
      const run = this.db.prepare("SELECT lease_owner,recovery_state FROM research_runs WHERE id=?").get(input.runId) as
        { lease_owner: string | null; recovery_state: string } | undefined
      if (run?.lease_owner !== input.owner || run.recovery_state !== "READY") throw new Error("Research lease is not active.")
      let row = this.db.prepare("SELECT id,state FROM research_call_ledger WHERE run_id=? AND query_hash=?")
        .get(input.runId, input.hash) as { id: string; state: string } | undefined
      if (!row) {
        const id = randomUUID(), now = new Date().toISOString()
        this.db.prepare(`INSERT INTO research_call_ledger
          (id,run_id,provider,capability,query_hash,query_json,state,created_at,updated_at)
          VALUES (?,?,?,?,?,?,'PREPARED',?,?)`).run(id, input.runId, input.provider, input.capability,
          input.hash, JSON.stringify(input.query), now, now)
        row = { id, state: "PREPARED" }
      }
      return row
    })()
  }

  startCall(callId: string) {
    const changed = this.db.prepare(`UPDATE research_call_ledger SET state='IN_FLIGHT',attempt_count=attempt_count+1,updated_at=?
      WHERE id=? AND state='PREPARED'`).run(new Date().toISOString(), callId).changes
    if (!changed) throw new Error("External call cannot be dispatched twice.")
  }

  completeCall(input: { callId: string; runId: string; investigationId: string; provider: string; capability: string;
    hash: string; estimated: number; result: MarketResult; cache: boolean }) {
    return this.db.transaction(() => {
      const row = this.db.prepare("SELECT state FROM research_call_ledger WHERE id=? AND run_id=?").get(input.callId, input.runId) as
        { state: string } | undefined
      if (row?.state !== "IN_FLIGHT" && row?.state !== "PREPARED") throw new Error("External call result is not claimable.")
      if (input.cache) this.cachePut(input.hash, input.provider, input.result)
      const ids = this.recordEvidence(input.investigationId, input.result.metrics)
      const link = this.db.prepare("INSERT INTO research_call_evidence (call_id,evidence_id) VALUES (?,?)")
      for (const id of ids) link.run(input.callId, id)
      this.recordQuery({ runId: input.runId, provider: input.provider, capability: input.capability,
        hash: input.hash, status: "COMPLETED", estimated: input.estimated,
        reported: input.cache ? input.result.creditsReported : 0 })
      this.db.prepare("UPDATE research_call_ledger SET state='COMPLETED',updated_at=? WHERE id=?")
        .run(new Date().toISOString(), input.callId)
      return ids
    })()
  }

  markUnknown(callId: string) {
    this.db.prepare("UPDATE research_call_ledger SET state='UNKNOWN',updated_at=?,error='Dispatch outcome unknown' WHERE id=? AND state='IN_FLIGHT'")
      .run(new Date().toISOString(), callId)
  }

  completedMetrics(callId: string): Array<{ metric: MarketMetric; evidenceId: string }> {
    const rows = this.db.prepare(`SELECT e.*,s.provider,s.source_url FROM research_call_evidence link
      JOIN research_evidence e ON e.id=link.evidence_id JOIN research_sources s ON s.id=e.source_id
      WHERE link.call_id=? AND (e.expires_at IS NULL OR e.expires_at>?)`).all(callId, new Date().toISOString()) as Array<{
        id: string; provider: MarketMetric["provider"]; source_url: string; record_id: string; captured_at: string;
        period: string; metric: string; unit: string; numeric_value: number; kind: string; uncertainty: string | null;
        value_json: string }>
    return rows.map((row) => ({ evidenceId: row.id, metric: { provider: row.provider, sourceId: row.record_id,
      sourceUrl: row.source_url, capturedAt: row.captured_at, period: row.period, metric: row.metric,
      unit: row.unit, value: row.numeric_value, nature: row.kind === "provider_estimate" ? "estimated" :
        row.kind === "ai_inference" ? "inferred" : "observed", uncertainty: row.uncertainty || undefined,
      subject: (JSON.parse(row.value_json) as { subject: string }).subject } }))
  }
  completedCalls(runId: string) {
    return this.db.prepare(`SELECT provider,query_hash FROM research_call_ledger
      WHERE run_id=? AND state='COMPLETED'`).all(runId) as Array<{ provider: string; query_hash: string }>
  }
  cacheGet(hash: string): MarketResult | null {
    this.purgeExpired()
    const row = this.db.prepare("SELECT result_json FROM research_query_cache WHERE query_hash=?").get(hash) as { result_json: string } | undefined
    return row ? JSON.parse(row.result_json) as MarketResult : null
  }
  cachePut(hash: string, provider: string, result: MarketResult) {
    const now = new Date(), policy = getProviderPolicy(provider)
    if (!policy.storeEvidence || policy.cacheHours === null) throw new Error(`Cache policy pending for ${provider}.`)
    const ttl = policy.cacheHours * 60 * 60 * 1000
    this.db.prepare("INSERT OR REPLACE INTO research_query_cache (query_hash,provider,result_json,captured_at,expires_at) VALUES (?,?,?,?,?)")
      .run(hash, provider, JSON.stringify(result), now.toISOString(), new Date(now.getTime() + ttl).toISOString())
  }
  recordQuery(input: { runId: string; provider: string; capability: string; hash: string; status: string;
    estimated?: number | null; reported?: number | null; error?: string }) {
    this.db.prepare(`INSERT INTO research_queries (id,run_id,provider,capability,query_hash,status,credits_estimated,credits_reported,error,captured_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(), input.runId, input.provider, input.capability, input.hash,
      input.status, input.estimated ?? null, input.reported ?? null, input.error?.slice(0, 250) || null, new Date().toISOString())
  }
  recordEvidence(investigationId: string, metrics: MarketMetric[]) {
    return this.db.transaction(() => {
      const ids: string[] = []
      for (const metric of metrics) {
        const sourceId = randomUUID(), id = randomUUID(), now = new Date()
        const expires = providerExpiry(metric.provider, now)
        this.db.prepare(`INSERT INTO research_sources (id,investigation_id,provider,source_url,queried_at,metadata_json)
          VALUES (?,?,?,?,?,?)`).run(sourceId, investigationId, metric.provider, metric.sourceUrl, metric.capturedAt, "{}")
        this.db.prepare(`INSERT INTO research_evidence (id,investigation_id,source_id,record_id,kind,value_json,created_at,metric,unit,numeric_value,period,captured_at,expires_at,uncertainty)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, investigationId, sourceId, metric.sourceId,
          metric.nature === "estimated" ? "provider_estimate" : metric.nature === "inferred" ? "ai_inference" : "observed",
          JSON.stringify({ subject: metric.subject }), now.toISOString(), metric.metric, metric.unit, metric.value,
          metric.period, metric.capturedAt, expires, metric.uncertainty || null)
        ids.push(id)
      }
      return ids
    })()
  }
  addOpportunity(investigationId: string, title: string, rationale: string, evidenceIds: string[]) {
    if (!evidenceIds.length) throw new Error("An opportunity requires evidence.")
    return this.db.transaction(() => {
      const id = randomUUID(), now = new Date().toISOString()
      let retentionExpiry: string | null = null
      let restrictedProvider: string | null = null
      for (const evidenceId of evidenceIds) {
        const evidence = this.db.prepare(`SELECT e.investigation_id,e.expires_at,s.provider FROM research_evidence e
          JOIN research_sources s ON s.id=e.source_id WHERE e.id=?`).get(evidenceId) as
          { investigation_id: string; expires_at: string | null; provider: string } | undefined
        if (!evidence || evidence.investigation_id !== investigationId) throw new Error("Evidence lineage is invalid.")
        if (evidence.expires_at && (!retentionExpiry || evidence.expires_at < retentionExpiry)) {
          retentionExpiry = evidence.expires_at
          restrictedProvider = evidence.provider
        }
      }
      this.db.prepare(`INSERT INTO research_opportunities
        (id,investigation_id,title,rationale,created_at,updated_at,origin_provider,retention_expires_at)
        VALUES (?,?,?,?,?,?,?,?)`).run(id, investigationId, title.slice(0, 160), rationale.slice(0, 1000), now, now,
          restrictedProvider, retentionExpiry)
      const stmt = this.db.prepare("INSERT INTO research_opportunity_evidence (opportunity_id,evidence_id) VALUES (?,?)")
      for (const evidenceId of evidenceIds) stmt.run(id, evidenceId)
      return id
    })()
  }
  finish(runId: string, status: "COMPLETED" | "PARTIAL" | "INSUFFICIENT" | "FAILED", coverage: unknown, usage: unknown, error?: string) {
    this.db.prepare("UPDATE research_runs SET status=?,coverage_json=?,usage_json=?,error=?,updated_at=?,lease_owner=NULL,lease_expires_at=NULL WHERE id=?")
      .run(status, JSON.stringify(coverage), JSON.stringify(usage), error?.slice(0, 250) || null, new Date().toISOString(), runId)
    this.db.prepare("UPDATE research_investigations SET status=?,updated_at=? WHERE id=(SELECT investigation_id FROM research_runs WHERE id=?)")
      .run(status, new Date().toISOString(), runId)
  }
  getInvestigation(id: string) {
    this.purgeExpired()
    const investigation = this.db.prepare("SELECT * FROM research_investigations WHERE id=?").get(id)
    const runs = this.db.prepare("SELECT * FROM research_runs WHERE investigation_id=? ORDER BY started_at DESC").all(id)
    const opportunities = this.db.prepare(`SELECT o.*,CASE WHEN s.opportunity_id IS NULL THEN 0 ELSE 1 END selected
      FROM research_opportunities o LEFT JOIN research_opportunity_selections s ON s.opportunity_id=o.id
      WHERE o.investigation_id=? ORDER BY o.created_at DESC`).all(id) as Array<{ id: string; selected: number; title: string; rationale: string }>
    const evidence = this.db.prepare(`SELECT e.*,s.provider,s.source_url FROM research_evidence e
      LEFT JOIN research_sources s ON s.id=e.source_id WHERE e.investigation_id=? ORDER BY e.created_at DESC`).all(id)
    const links = this.db.prepare(`SELECT opportunity_id,evidence_id FROM research_opportunity_evidence
      WHERE opportunity_id IN (SELECT id FROM research_opportunities WHERE investigation_id=?)`).all(id)
    const knowledge = this.db.prepare("SELECT * FROM research_knowledge WHERE investigation_id=? ORDER BY created_at DESC").all(id)
    return { investigation, runs, opportunities, evidence, links, knowledge }
  }
  addKnowledge(input: { investigationId: string; opportunityId?: string; kind: "conclusion" | "hypothesis" | "decision" | "brief" | "concept" | "prompt" | "correction";
    title: string; content: string; author: "owner" | "system"; originalConfirmed: boolean; evidenceIds: string[] }) {
    if (!input.title.trim() || !input.content.trim()) throw new Error("Knowledge needs title and content.")
    if (input.originalConfirmed && input.author !== "owner") throw new Error("Only the owner can confirm original knowledge.")
    return this.db.transaction(() => {
      const investigation = this.db.prepare("SELECT id FROM research_investigations WHERE id=?").get(input.investigationId)
      if (!investigation) throw new Error("Investigation not found.")
      if (input.opportunityId) {
        const opportunity = this.db.prepare("SELECT id FROM research_opportunities WHERE id=? AND investigation_id=?")
          .get(input.opportunityId, input.investigationId)
        if (!opportunity) throw new Error("Opportunity lineage is invalid.")
      }
      let expiry: string | null = null
      const provenance = new Map<string, { provider: string; sourceId: string; capturedAt: string }>()
      for (const evidenceId of input.evidenceIds) {
        const row = this.db.prepare(`SELECT e.investigation_id,e.expires_at,e.source_id,e.captured_at,s.provider FROM research_evidence e
          JOIN research_sources s ON s.id=e.source_id WHERE e.id=?`).get(evidenceId) as
          { investigation_id: string; expires_at: string | null; source_id: string; captured_at: string; provider: string } | undefined
        if (!row || row.investigation_id !== input.investigationId) throw new Error("Evidence lineage is invalid.")
        const policy = getProviderPolicy(row.provider)
        if (input.originalConfirmed && !policy.retainOriginalKnowledge) throw new Error(`Original knowledge retention is not confirmed for ${row.provider}.`)
        if (row.expires_at && (!expiry || row.expires_at < expiry)) expiry = row.expires_at
        provenance.set(row.source_id, { provider: row.provider, sourceId: row.source_id, capturedAt: row.captured_at })
      }
      if (input.author === "system" && !input.evidenceIds.length) throw new Error("System knowledge requires evidence lineage.")
      const id = randomUUID(), now = new Date().toISOString()
      this.db.prepare(`INSERT INTO research_knowledge
        (id,investigation_id,opportunity_id,kind,title,content,author,original_confirmed,expires_at,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, input.investigationId, input.opportunityId ?? null, input.kind,
        input.title, input.content, input.author, input.originalConfirmed ? 1 : 0,
        input.originalConfirmed ? null : expiry, now)
      const insert = this.db.prepare(`INSERT INTO research_knowledge_provenance
        (knowledge_id,provider,investigation_id,source_id,captured_at) VALUES (?,?,?,?,?)`)
      for (const source of provenance.values()) insert.run(id, source.provider, input.investigationId, source.sourceId, source.capturedAt)
      return id
    })()
  }
  selectOpportunity(id: string, selected: boolean) {
    const exists = this.db.prepare("SELECT id FROM research_opportunities WHERE id=?").get(id)
    if (!exists) throw new Error("Opportunity not found.")
    if (selected) this.db.prepare("INSERT OR IGNORE INTO research_opportunity_selections (opportunity_id,selected_at) VALUES (?,?)")
      .run(id, new Date().toISOString())
    else this.db.prepare("DELETE FROM research_opportunity_selections WHERE opportunity_id=?").run(id)
  }
}
