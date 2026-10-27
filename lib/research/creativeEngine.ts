import type Database from "better-sqlite3"
import type { ProductType } from "../products"
import { LearningRepository } from "./learning"
import { evaluatePrompts, type PromptCandidate } from "./promptDiversity"
import { PromptRunRepository } from "./promptRuns"

export type CreativeInput = {
  brief: string; mode: "variations" | "independent"; niche?: string; productType?: ProductType;
  investigationId?: string; opportunityId?: string; conceptId?: string;
  referenceHashes?: string[]; referenceImages?: string[]; regenerate?: boolean; requiredTerms?: string[]
}
export type GenerationContext = CreativeInput & {
  investigation?: { title: string; query: string; status: string } | null
  opportunity?: { title: string } | null
  opportunityEvidence?: Array<{ provider: string; metric: string; value: number; unit: string; period: string;
    nature: string; uncertainty: string | null; sourceUrl: string; expiresAt: string | null; capturedAt: string }>
  rules: Array<{ id: string; version: number; instruction: string }>
  instructionVersion: string
}
export type GenerationResult = { prompts: PromptCandidate[]; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }; estimatedCostUsd?: number | null }
export type CreativeProvider = {
  model: string
  generate(context: GenerationContext): Promise<GenerationResult>
  repair(context: GenerationContext, prompts: PromptCandidate[], issues: Array<{ index: number; reason: string }>): Promise<{
    replacements: Array<{ index: number; prompt: PromptCandidate }>;
    usage?: GenerationResult["usage"]; estimatedCostUsd?: number | null
  }>
}

const INSTRUCTION_VERSION = "creative-v1"

export async function generateCreativePrompts(db: Database.Database, input: CreativeInput, provider: CreativeProvider) {
  if (!input.brief.trim() || input.brief.length > 2000) throw new Error("Brief must contain 1-2000 characters.")
  if (!['variations', 'independent'].includes(input.mode)) throw new Error("Invalid generation mode.")
  if ((input.referenceHashes?.length || 0) > 3) throw new Error("At most three references are supported.")
  if (input.opportunityId && !input.investigationId) throw new Error("Opportunity needs an investigation.")
  const investigation = input.investigationId ? db.prepare("SELECT title,query,status FROM research_investigations WHERE id=?")
    .get(input.investigationId) as GenerationContext["investigation"] : null
  if (input.investigationId && !investigation) throw new Error("Investigation not found.")
  const opportunity = input.opportunityId ? db.prepare("SELECT title,investigation_id FROM research_opportunities WHERE id=?")
    .get(input.opportunityId) as { title: string; investigation_id: string } | undefined : null
  if (input.opportunityId && opportunity?.investigation_id !== input.investigationId) throw new Error("Opportunity does not belong to investigation.")
  const opportunityEvidence = input.opportunityId ? db.prepare(`SELECT s.provider,s.source_url AS sourceUrl,e.metric,e.numeric_value AS value,
    e.unit,e.period,e.kind AS nature,e.uncertainty,e.expires_at AS expiresAt,e.captured_at AS capturedAt FROM research_opportunity_evidence link
    JOIN research_evidence e ON e.id=link.evidence_id JOIN research_sources s ON s.id=e.source_id
    WHERE link.opportunity_id=? AND (e.expires_at IS NULL OR e.expires_at>?) ORDER BY e.created_at DESC LIMIT 20`)
    .all(input.opportunityId, new Date().toISOString()) as GenerationContext["opportunityEvidence"] : []
  if (input.opportunityId && !opportunityEvidence?.length) throw new Error("Opportunity evidence has expired or is unavailable; refresh it before creating prompts.")
  if (input.conceptId) {
    const concept = db.prepare("SELECT investigation_id FROM creative_concepts WHERE id=?").get(input.conceptId) as { investigation_id: string | null } | undefined
    if (!concept || concept.investigation_id !== (input.investigationId || null)) throw new Error("Concept lineage is invalid.")
  }
  const learning = new LearningRepository(db)
  const applicable = learning.getApplicableRules({ productType: input.productType, niche: input.niche,
    investigationId: input.investigationId, conceptId: input.conceptId, modality: input.mode })
  const rules = applicable.rules.map(({ id, version, instruction }) => ({ id, version, instruction }))
  const snapshot = { brief: input.brief.trim(), mode: input.mode, niche: input.niche?.trim().toLowerCase() || null,
    productType: input.productType || null, investigationId: input.investigationId || null, opportunityId: input.opportunityId || null,
    conceptId: input.conceptId || null, opportunityEvidence, referenceHashes: input.referenceHashes || [], requiredTerms: input.requiredTerms || [],
    rules: rules.map(({ id, version }) => [id, version]), model: provider.model, instructionVersion: INSTRUCTION_VERSION }
  const runs = new PromptRunRepository(db)
  const begun = runs.begin({ hash: PromptRunRepository.hash(snapshot), snapshot, mode: input.mode, investigationId: input.investigationId,
    opportunityId: input.opportunityId, conceptId: input.conceptId, model: provider.model, instructionVersion: INSTRUCTION_VERSION,
    regenerate: input.regenerate })
  if (begun.cached) return { ...runs.get(begun.versionId)!, cached: true, applicable }
  const context: GenerationContext = { ...input, investigation, opportunity, opportunityEvidence, rules, instructionVersion: INSTRUCTION_VERSION }
  const attempts: unknown[] = []
  try {
    const first = await provider.generate(context)
    let prompts = first.prompts
    let evaluation = evaluatePrompts(prompts, input.mode, input.requiredTerms)
    attempts.push({ kind: "generation", evaluation, usage: first.usage || null })
    let repairUsage: GenerationResult["usage"]
    let repairCost = 0
    if (!evaluation.passed && prompts.length === 4) {
      const affected = [...new Set(evaluation.issues.map((issue) => issue.index).filter((index) => index >= 0))]
      const repaired = await provider.repair(context, prompts, evaluation.issues)
      if (repaired.replacements.length !== affected.length ||
        repaired.replacements.some((item) => !affected.includes(item.index)) ||
        new Set(repaired.replacements.map((item) => item.index)).size !== affected.length) {
        throw new Error("Repair did not return only the affected prompts.")
      }
      prompts = prompts.map((prompt, index) => repaired.replacements.find((item) => item.index === index)?.prompt || prompt)
      repairUsage = repaired.usage
      repairCost = repaired.estimatedCostUsd || 0
      evaluation = evaluatePrompts(prompts, input.mode, input.requiredTerms)
      attempts.push({ kind: "repair", affected, evaluation, usage: repairUsage || null })
    }
    const usage = { inputTokens: (first.usage?.inputTokens || 0) + (repairUsage?.inputTokens || 0),
      outputTokens: (first.usage?.outputTokens || 0) + (repairUsage?.outputTokens || 0),
      totalTokens: (first.usage?.totalTokens || 0) + (repairUsage?.totalTokens || 0) }
    runs.complete({ ...begun, prompts, evaluation, attempts, usage,
      estimatedCostUsd: first.estimatedCostUsd == null ? null : first.estimatedCostUsd + repairCost, niche: input.niche })
    learning.recordRuleUses(begun.versionId, rules)
    return { ...runs.get(begun.versionId)!, cached: false, applicable }
  } catch (error) {
    runs.fail(begun.versionId, error instanceof Error ? error.message : "Generation failed.")
    throw error
  }
}
