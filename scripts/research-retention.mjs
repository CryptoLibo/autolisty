import { randomUUID } from "node:crypto"
import { providerPolicies } from "../lib/research/market/providerPolicies.mjs"
import { scrubAluraArtifacts } from "./research-retention-alura.mjs"

function scrubJson(raw, transform) {
  try { return JSON.stringify(transform(JSON.parse(raw || "{}"))) }
  catch { return null }
}

export function runResearchRetention(database, now = new Date(), origin = "inline") {
  const timestamp = now.toISOString(), id = randomUUID()
  database.prepare("INSERT INTO research_maintenance_log (id,started_at,status,origin) VALUES (?,?,'RUNNING',?)")
    .run(id, timestamp, origin)
  try {
    const counts = database.transaction(() => {
      const perProvider = {}
      for (const [provider, policy] of Object.entries(providerPolicies)) {
        if (!policy.maintenance || policy.evidenceHours === null) continue
        const cutoff = new Date(now.getTime() - policy.evidenceHours * 3600000).toISOString()
        const params = [provider, timestamp, cutoff]
        const target = `SELECT e.id FROM research_evidence e JOIN research_sources s ON s.id=e.source_id
          WHERE s.provider=? AND (e.expires_at<=? OR (e.expires_at IS NULL AND e.created_at<=?))`
        const expiredEvidence = database.prepare(target).all(...params).length
        const expiredLinks = database.prepare(`DELETE FROM research_opportunity_evidence WHERE evidence_id IN (${target})`)
          .run(...params).changes
        database.prepare(`DELETE FROM research_call_evidence WHERE evidence_id IN (${target})`).run(...params)
        const evidence = database.prepare(`DELETE FROM research_evidence WHERE id IN (${target})`).run(...params).changes
        const sources = database.prepare(`DELETE FROM research_sources WHERE provider=?
          AND id NOT IN (SELECT source_id FROM research_evidence WHERE source_id IS NOT NULL)`).run(provider).changes
        const opportunities = database.prepare(`UPDATE research_opportunities
          SET title='Expired provider evidence',rationale=NULL,status='EXPIRED',updated_at=?
          WHERE origin_provider=? AND retention_expires_at<=? AND status<>'EXPIRED'`)
          .run(timestamp, provider, timestamp).changes
        perProvider[provider] = { expiredEvidence, expiredLinks, evidence, sources, opportunities }
      }
      const cache = database.prepare("DELETE FROM research_query_cache WHERE expires_at<=?").run(timestamp).changes
      const knowledge = database.prepare("DELETE FROM research_knowledge WHERE expires_at IS NOT NULL AND expires_at<=?")
        .run(timestamp).changes
      let promptInputs = 0
      const prompts = database.prepare("SELECT id,input_json FROM creative_prompt_runs").all()
      const updatePrompt = database.prepare("UPDATE creative_prompt_runs SET input_json=? WHERE id=?")
      for (const row of prompts) {
        const next = scrubJson(row.input_json, (data) => ({ ...data,
          opportunityEvidence: (data.opportunityEvidence || []).filter((item) => {
            const policy = providerPolicies[item.provider]
            return !policy?.maintenance || (item.expiresAt && item.expiresAt > timestamp)
          }) }))
        if (next === null) throw new Error("Unable to scrub stored creative JSON.")
        if (next !== row.input_json) { updatePrompt.run(next, row.id); promptInputs++ }
      }
      let runCoverage = 0
      const runs = database.prepare("SELECT id,started_at,coverage_json FROM research_runs WHERE coverage_json IS NOT NULL").all()
      const updateCoverage = database.prepare("UPDATE research_runs SET coverage_json=? WHERE id=?")
      for (const row of runs) {
        const next = scrubJson(row.coverage_json, (data) => ({ ...data, discrepancies:
          (data.discrepancies || []).map((entry) => ({ ...entry,
            variants: (entry.variants || []).filter((variant) => {
              const policy = providerPolicies[variant.provider]
              return !policy?.maintenance || policy.evidenceHours === null ||
                row.started_at > new Date(now.getTime() - policy.evidenceHours * 3600000).toISOString()
            }) })).filter((entry) => entry.variants.length > 1) }))
        if (next === null) throw new Error("Unable to scrub stored research coverage.")
        if (next !== row.coverage_json) { updateCoverage.run(next, row.id); runCoverage++ }
      }
      let errors = 0
      for (const [provider, policy] of Object.entries(providerPolicies)) {
        if (!policy.maintenance || policy.evidenceHours === null) continue
        errors += database.prepare(`UPDATE research_queries SET error=NULL
          WHERE error IS NOT NULL AND provider=? AND captured_at<=?`)
          .run(provider, new Date(now.getTime() - policy.evidenceHours * 3600000).toISOString()).changes
      }
      return { perProvider, cache, knowledge, promptInputs, runCoverage, errors, ...scrubAluraArtifacts(database, now) }
    })()
    database.prepare("UPDATE research_maintenance_log SET status='COMPLETED',finished_at=?,counts_json=? WHERE id=?")
      .run(timestamp, JSON.stringify(counts), id)
    return { id, status: "COMPLETED", counts }
  } catch (error) {
    database.prepare("UPDATE research_maintenance_log SET status='FAILED',finished_at=?,error=? WHERE id=?")
      .run(timestamp, error instanceof Error ? error.message.slice(0, 250) : "Retention failed.", id)
    throw error
  }
}
