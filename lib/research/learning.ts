import { createHash, randomUUID } from "node:crypto"
import type Database from "better-sqlite3"
import type { ProductType } from "../products"
import { PRODUCT_OPTIONS } from "../products"
import { estimatePromptTokens } from "./tokenEstimate"

export type RuleScope = "general" | "product" | "niche" | "design"
export type RuleStatus = "PROPOSED" | "ACTIVE" | "INACTIVE" | "CONFLICT"

type RuleRow = {
  id: string
  original_text: string
  instruction: string
  structured_json: string
  scope: RuleScope
  scope_key: string
  conflict_key: string
  polarity: number
  priority: number
  status: RuleStatus
  version: number
  fingerprint: string
  created_at: string
  updated_at: string
}

export type ApplicableContext = {
  productType?: ProductType | null
  niche?: string | null
  investigationId?: string | null
  conceptId?: string | null
  designId?: string | null
  modality?: "variations" | "independent" | null
}

export type CorrectionInput = {
  text: string
  scope?: RuleScope
  scopeKey?: string
  instruction?: string
  conflictKey?: string
  priority?: number
  activate?: boolean
}

const productTypes = new Set(PRODUCT_OPTIONS.map((product) => product.value))

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US")
}

function keyFromText(text: string) {
  return normalize(text).replace(/^(please |do not |don't |avoid |use |include |no uses |evita |usa |incluye )+/i, "")
}

function scopeKey(scope: RuleScope, input: string) {
  const key = normalize(input)
  if (scope === "general") return ""
  if (!key) throw new Error("A scope key is required.")
  if (scope === "product" && !productTypes.has(key as ProductType)) throw new Error("Unknown product type.")
  if (scope === "design" && !/^(design|concept):[a-z0-9-]+$/.test(key)) {
    throw new Error("Design scope requires design:<id> or concept:<id>.")
  }
  return key
}

function safePriority(value: number | undefined) {
  if (value === undefined) return 0
  if (!Number.isInteger(value) || value < -10 || value > 10) throw new Error("Invalid priority.")
  return value
}

function validateText(value: string, label: string) {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 1000) throw new Error(`${label} must contain 1-1000 characters.`)
  return trimmed
}

export class LearningRepository {
  constructor(private readonly database: Database.Database) {}

  private getRow(id: string) {
    return this.database.prepare("SELECT * FROM creative_corrections WHERE id = ?").get(id) as RuleRow | undefined
  }

  private conflicts(rule: Pick<RuleRow, "id" | "scope" | "scope_key" | "conflict_key" | "instruction">) {
    return this.database.prepare(`
      SELECT id FROM creative_corrections
      WHERE id <> ? AND status = 'ACTIVE' AND scope = ? AND scope_key = ?
        AND conflict_key = ? AND instruction <> ?
    `).all(rule.id, rule.scope, rule.scope_key, rule.conflict_key, rule.instruction) as Array<{ id: string }>
  }

  createCorrection(input: CorrectionInput) {
    const text = validateText(input.text, "Correction")
    const instruction = validateText(input.instruction || text, "Instruction")
    const scope = input.scope || "general"
    const key = scopeKey(scope, input.scopeKey || "")
    const conflictKey = normalize(input.conflictKey || keyFromText(instruction))
    if (!conflictKey || conflictKey.length > 200) throw new Error("Invalid conflict key.")
    const priority = safePriority(input.priority)
    const fingerprint = createHash("sha256").update(JSON.stringify([scope, key, normalize(text)])).digest("hex")
    const polarity = /^(do not|don't|avoid|no uses?|evita|sin )/i.test(instruction) ? -1 : 1
    const explicitScope = input.scope !== undefined
    const now = new Date().toISOString()
    const id = randomUUID()
    const proposed = { id, scope, scope_key: key, conflict_key: conflictKey, instruction }

    return this.database.transaction(() => {
      const existing = this.database.prepare("SELECT id FROM creative_corrections WHERE fingerprint = ?").get(fingerprint) as { id: string } | undefined
      if (existing) return { rule: this.getRow(existing.id)!, duplicate: true, conflicts: [] as string[] }
      const conflicts = this.conflicts(proposed).map((item) => item.id)
      const status: RuleStatus = !explicitScope || input.activate === false
        ? "PROPOSED" : conflicts.length ? "CONFLICT" : "ACTIVE"
      const structured = JSON.stringify({ instruction, conflictKey, polarity })
      this.database.prepare(`
        INSERT INTO creative_corrections
        (id,original_text,instruction,structured_json,scope,scope_key,conflict_key,polarity,priority,status,version,fingerprint,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?)
      `).run(id, text, instruction, structured, scope, key, conflictKey, polarity, priority, status, fingerprint, now, now)
      const rule = this.getRow(id)!
      this.recordHistory(rule, "CREATED")
      return { rule, duplicate: false, conflicts }
    })()
  }

  updateCorrection(id: string, input: {
    expectedVersion: number
    text?: string
    instruction?: string
    scope?: RuleScope
    scopeKey?: string
    conflictKey?: string
    priority?: number
    status?: RuleStatus
  }) {
    return this.database.transaction(() => {
      const current = this.getRow(id)
      if (!current) throw new Error("Correction not found.")
      if (current.version !== input.expectedVersion) throw new Error("Correction changed; reload before editing.")
      const text = input.text === undefined ? current.original_text : validateText(input.text, "Correction")
      const instruction = input.instruction === undefined ? current.instruction : validateText(input.instruction, "Instruction")
      const scope = input.scope || current.scope
      const key = scopeKey(scope, input.scopeKey ?? current.scope_key)
      const conflictKey = normalize(input.conflictKey || current.conflict_key)
      if (!conflictKey || conflictKey.length > 200) throw new Error("Invalid conflict key.")
      const priority = input.priority === undefined ? current.priority : safePriority(input.priority)
      const fingerprint = createHash("sha256").update(JSON.stringify([scope, key, normalize(text)])).digest("hex")
      const conflicts = this.conflicts({ id, scope, scope_key: key, conflict_key: conflictKey, instruction }).map((item) => item.id)
      const requestedStatus = input.status || current.status
      const status: RuleStatus = requestedStatus === "ACTIVE" && conflicts.length ? "CONFLICT" : requestedStatus
      const polarity = /^(do not|don't|avoid|no uses?|evita|sin )/i.test(instruction) ? -1 : 1
      const now = new Date().toISOString()
      this.database.prepare(`
        UPDATE creative_corrections SET original_text=?,instruction=?,structured_json=?,scope=?,scope_key=?,conflict_key=?,
          polarity=?,priority=?,status=?,version=version+1,fingerprint=?,updated_at=? WHERE id=?
      `).run(text, instruction, JSON.stringify({ instruction, conflictKey, polarity }), scope, key, conflictKey,
        polarity, priority, status, fingerprint, now, id)
      const rule = this.getRow(id)!
      this.recordHistory(rule, "UPDATED")
      return { rule, conflicts }
    })()
  }

  private recordHistory(rule: RuleRow, eventType: string) {
    this.database.prepare(`
      INSERT INTO creative_correction_history (correction_id,version,event_type,snapshot_json,created_at)
      VALUES (?,?,?,?,?)
    `).run(rule.id, rule.version, eventType, JSON.stringify(rule), new Date().toISOString())
  }

  listCorrections(limit = 100) {
    return this.database.prepare("SELECT * FROM creative_corrections ORDER BY updated_at DESC LIMIT ?")
      .all(Math.max(1, Math.min(500, Math.trunc(limit)))) as RuleRow[]
  }

  getHistory(id: string) {
    return this.database.prepare("SELECT version,event_type,snapshot_json,created_at FROM creative_correction_history WHERE correction_id=? ORDER BY version")
      .all(id)
  }

  getApplicableRules(context: ApplicableContext, options: { maxMemoryTokens?: number; runId?: string } = {}) {
    const maxMemoryTokens = options.maxMemoryTokens ?? 600
    if (!Number.isInteger(maxMemoryTokens) || maxMemoryTokens < 1 || maxMemoryTokens > 8000) {
      throw new Error("Invalid memory budget.")
    }
    const product = context.productType || ""
    const concept = context.conceptId ? this.database.prepare("SELECT niche_key FROM creative_concepts WHERE id=?")
      .get(context.conceptId) as { niche_key: string | null } | undefined : undefined
    const niche = normalize(context.niche || concept?.niche_key || "")
    const designKey = context.designId ? `design:${normalize(context.designId)}` : ""
    const conceptKey = context.conceptId ? `concept:${normalize(context.conceptId)}` : ""
    const candidates = this.database.prepare(`
      SELECT * FROM creative_corrections WHERE status='ACTIVE' AND (
        scope='general' OR (scope='product' AND scope_key=?) OR
        (scope='niche' AND scope_key=?) OR
        (scope='design' AND scope_key IN (?,?))
      ) ORDER BY CASE scope WHEN 'design' THEN 0 WHEN 'niche' THEN 1 WHEN 'product' THEN 2 ELSE 3 END,
        priority DESC, updated_at DESC LIMIT 200
    `).all(product, niche, designKey, conceptKey) as RuleRow[]

    const rules: Array<{ id: string; version: number; instruction: string; scope: RuleScope; scopeKey: string }> = []
    const seenKeys = new Set<string>()
    const selectedByConflictKey = new Map<string, RuleRow>()
    const contradictions: Array<{ selectedRuleId: string; overriddenRuleId: string }> = []
    let estimatedTokens = 0
    let budgetLimited = false
    for (const item of candidates) {
      const selected = selectedByConflictKey.get(item.conflict_key)
      if (selected && selected.instruction !== item.instruction) {
        contradictions.push({ selectedRuleId: selected.id, overriddenRuleId: item.id })
      }
      if (seenKeys.has(item.conflict_key) || seenKeys.has(normalize(item.instruction))) continue
      const cost = estimatePromptTokens(item.instruction) + 8
      if (estimatedTokens + cost > maxMemoryTokens) {
        budgetLimited = true
        continue
      }
      seenKeys.add(item.conflict_key)
      seenKeys.add(normalize(item.instruction))
      selectedByConflictKey.set(item.conflict_key, item)
      estimatedTokens += cost
      rules.push({ id: item.id, version: item.version, instruction: item.instruction, scope: item.scope, scopeKey: item.scope_key })
    }
    if (options.runId) {
      const statement = this.database.prepare(`
        INSERT OR IGNORE INTO creative_rule_uses (run_id,correction_id,correction_version,used_at)
        VALUES (?,?,?,?)
      `)
      this.database.transaction(() => {
        for (const rule of rules) statement.run(options.runId, rule.id, rule.version, new Date().toISOString())
      })()
    }
    return { rules, contradictions, estimatedTokens, budgetTokens: maxMemoryTokens, truncated: candidates.length === 200 || budgetLimited }
  }

  recordRuleUses(runId: string, rules: Array<{ id: string; version: number }>) {
    const statement = this.database.prepare(`INSERT OR IGNORE INTO creative_rule_uses
      (run_id,correction_id,correction_version,used_at) VALUES (?,?,?,?)`)
    this.database.transaction(() => {
      for (const rule of rules) statement.run(runId, rule.id, rule.version, new Date().toISOString())
    })()
  }
}
