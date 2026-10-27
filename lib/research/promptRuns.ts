import { createHash, randomUUID } from "node:crypto"
import type Database from "better-sqlite3"
import { CreativeRepository } from "./creativeRepository"
import type { PromptCandidate } from "./promptDiversity"

type RunRow = { id: string; input_hash: string; mode: "variations" | "independent"; investigation_id: string | null; opportunity_id: string | null; concept_id: string | null }
type VersionRow = { id: string; version: number; status: string; prompts_json: string | null; evaluation_json: string | null; attempts_json: string; usage_json: string | null; estimated_cost_usd: number | null; error: string | null }

export class PromptRunRepository {
  constructor(private readonly db: Database.Database) {}

  static hash(input: unknown) { return createHash("sha256").update(JSON.stringify(input)).digest("hex") }

  begin(input: { hash: string; snapshot: unknown; mode: "variations" | "independent"; investigationId?: string; opportunityId?: string; conceptId?: string; model: string; instructionVersion: string; regenerate?: boolean }) {
    return this.db.transaction(() => {
      let run = this.db.prepare("SELECT * FROM creative_prompt_runs WHERE input_hash=?").get(input.hash) as RunRow | undefined
      if (!run) {
        const id = randomUUID()
        this.db.prepare(`INSERT INTO creative_prompt_runs (id,input_hash,input_json,mode,investigation_id,opportunity_id,concept_id,model,instruction_version,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, input.hash, JSON.stringify(input.snapshot), input.mode, input.investigationId || null,
            input.opportunityId || null, input.conceptId || null, input.model, input.instructionVersion, new Date().toISOString())
        run = this.db.prepare("SELECT * FROM creative_prompt_runs WHERE id=?").get(id) as RunRow
      }
      const latest = this.db.prepare("SELECT * FROM creative_prompt_run_versions WHERE run_id=? ORDER BY version DESC LIMIT 1").get(run.id) as VersionRow | undefined
      if (latest?.status === "COMPLETED" && !input.regenerate) return { cached: true as const, runId: run.id, versionId: latest.id }
      if (latest?.status === "IN_PROGRESS") throw new Error("This request is already running.")
      const versionId = randomUUID(), now = new Date().toISOString()
      this.db.prepare(`INSERT INTO creative_prompt_run_versions (id,run_id,version,status,created_at,updated_at)
        VALUES (?,?,?,'IN_PROGRESS',?,?)`).run(versionId, run.id, (latest?.version || 0) + 1, now, now)
      return { cached: false as const, runId: run.id, versionId }
    })()
  }

  complete(input: { runId: string; versionId: string; prompts: PromptCandidate[]; evaluation: unknown; attempts: unknown[]; usage: unknown; estimatedCostUsd?: number | null; niche?: string }) {
    return this.db.transaction(() => {
      const run = this.db.prepare("SELECT * FROM creative_prompt_runs WHERE id=?").get(input.runId) as RunRow | undefined
      const version = this.db.prepare("SELECT status FROM creative_prompt_run_versions WHERE id=? AND run_id=?").get(input.versionId, input.runId) as { status: string } | undefined
      if (!run || version?.status !== "IN_PROGRESS" || input.prompts.length !== 4) throw new Error("Prompt run is not completable.")
      const creative = new CreativeRepository(this.db)
      let sharedConcept = run.concept_id
      if (run.mode === "variations" && !sharedConcept) {
        sharedConcept = creative.createGeneratedConcept({ investigationId: run.investigation_id, opportunityId: run.opportunity_id,
          title: input.prompts[0].title, nicheKey: input.niche })
        this.db.prepare("UPDATE creative_prompt_runs SET concept_id=? WHERE id=?").run(sharedConcept, run.id)
      }
      for (let index = 0; index < input.prompts.length; index++) {
        const conceptId = run.mode === "independent"
          ? creative.createGeneratedConcept({ investigationId: run.investigation_id, opportunityId: run.opportunity_id,
            title: input.prompts[index].title, nicheKey: input.niche })
          : sharedConcept!
        const saved = creative.savePromptVersion({ conceptId, text: input.prompts[index].prompt, origin: "prompt_lab" })
        this.db.prepare(`INSERT INTO creative_prompt_run_concepts (version_id,prompt_index,concept_id,prompt_id,prompt_revision)
          VALUES (?,?,?,?,?)`).run(input.versionId, index, conceptId, saved.promptId, saved.revision)
      }
      this.db.prepare(`UPDATE creative_prompt_run_versions SET status='COMPLETED',prompts_json=?,evaluation_json=?,attempts_json=?,
        usage_json=?,estimated_cost_usd=?,updated_at=? WHERE id=?`).run(JSON.stringify(input.prompts), JSON.stringify(input.evaluation),
        JSON.stringify(input.attempts), JSON.stringify(input.usage), input.estimatedCostUsd ?? null, new Date().toISOString(), input.versionId)
    })()
  }

  fail(versionId: string, error: string) {
    this.db.prepare("UPDATE creative_prompt_run_versions SET status='FAILED',error=?,updated_at=? WHERE id=? AND status='IN_PROGRESS'")
      .run(error.slice(0, 500), new Date().toISOString(), versionId)
  }

  get(versionId: string) {
    const row = this.db.prepare(`SELECT v.*,r.mode,r.investigation_id,r.opportunity_id,r.concept_id FROM creative_prompt_run_versions v
      JOIN creative_prompt_runs r ON r.id=v.run_id WHERE v.id=?`).get(versionId) as (VersionRow & { run_id: string; mode: string; investigation_id: string | null; opportunity_id: string | null; concept_id: string | null }) | undefined
    if (!row) return null
    const links = this.db.prepare("SELECT prompt_index,concept_id,prompt_id,prompt_revision FROM creative_prompt_run_concepts WHERE version_id=? ORDER BY prompt_index").all(versionId)
    const selections = this.db.prepare("SELECT prompt_index FROM creative_prompt_selections WHERE version_id=?").all(versionId) as Array<{ prompt_index: number }>
    return { versionId, runId: row.run_id, version: row.version, status: row.status, mode: row.mode,
      investigationId: row.investigation_id, opportunityId: row.opportunity_id, conceptId: row.concept_id,
      prompts: row.prompts_json ? JSON.parse(row.prompts_json) as PromptCandidate[] : [],
      evaluation: row.evaluation_json ? JSON.parse(row.evaluation_json) : null,
      attempts: JSON.parse(row.attempts_json), usage: row.usage_json ? JSON.parse(row.usage_json) : null,
      estimatedCostUsd: row.estimated_cost_usd, error: row.error, links,
      selected: selections.map((item) => item.prompt_index) }
  }

  list(limit = 30) {
    return this.db.prepare(`SELECT v.id,v.run_id,v.version,v.status,v.created_at,r.mode,r.input_json FROM creative_prompt_run_versions v
      JOIN creative_prompt_runs r ON r.id=v.run_id ORDER BY v.created_at DESC LIMIT ?`).all(Math.max(1, Math.min(100, limit)))
  }

  versions(runId: string) {
    const rows = this.db.prepare("SELECT id FROM creative_prompt_run_versions WHERE run_id=? ORDER BY version DESC").all(runId) as Array<{ id: string }>
    return rows.map((row) => this.get(row.id))
  }

  select(versionId: string, index: number) {
    if (!Number.isInteger(index) || index < 0 || index > 3) throw new Error("Invalid prompt index.")
    if (!this.get(versionId) || this.get(versionId)?.status !== "COMPLETED") throw new Error("Prompt version is unavailable.")
    this.db.prepare("INSERT OR IGNORE INTO creative_prompt_selections (version_id,prompt_index,selected_at) VALUES (?,?,?)")
      .run(versionId, index, new Date().toISOString())
    return this.get(versionId)
  }
}
