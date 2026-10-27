import { randomUUID } from "node:crypto"
import type Database from "better-sqlite3"
import type { ProductType } from "../products"

export class CreativeRepository {
  constructor(private readonly database: Database.Database) {}

  createGeneratedConcept(input: { investigationId?: string | null; opportunityId?: string | null; title: string; nicheKey?: string }) {
    if (input.opportunityId) {
      const opportunity = this.database.prepare("SELECT investigation_id FROM research_opportunities WHERE id=?")
        .get(input.opportunityId) as { investigation_id: string } | undefined
      if (!opportunity || opportunity.investigation_id !== input.investigationId) throw new Error("Opportunity lineage is invalid.")
    }
    const id = randomUUID()
    const now = new Date().toISOString()
    this.database.prepare(`INSERT INTO creative_concepts
      (id,investigation_id,opportunity_id,title,niche_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
      .run(id, input.investigationId || null, input.opportunityId || null, input.title, input.nicheKey?.trim().toLowerCase() || null, now, now)
    return id
  }

  createOpportunity(investigationId: string, title: string) {
    const id = randomUUID()
    const now = new Date().toISOString()
    this.database.prepare(`INSERT INTO research_opportunities (id,investigation_id,title,created_at,updated_at) VALUES (?,?,?,?,?)`)
      .run(id, investigationId, title, now, now)
    return id
  }

  createConcept(input: { investigationId: string; opportunityId: string; title: string; nicheKey?: string }) {
    const opportunity = this.database.prepare("SELECT investigation_id FROM research_opportunities WHERE id=?")
      .get(input.opportunityId) as { investigation_id: string } | undefined
    if (!opportunity || opportunity.investigation_id !== input.investigationId) {
      throw new Error("Opportunity does not belong to this investigation.")
    }
    const id = randomUUID()
    const now = new Date().toISOString()
    this.database.prepare(`INSERT INTO creative_concepts (id,investigation_id,opportunity_id,title,niche_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
      .run(id, input.investigationId, input.opportunityId, input.title, input.nicheKey?.trim().toLowerCase() || null, now, now)
    return id
  }

  listConcepts(investigationId: string) {
    return this.database.prepare(`SELECT * FROM creative_concepts WHERE investigation_id=? ORDER BY created_at DESC`)
      .all(investigationId) as Array<{ id: string; opportunity_id: string; title: string; niche_key: string | null }>
  }

  savePromptVersion(input: { conceptId: string; promptId?: string; text: string; origin: string }) {
    const promptId = input.promptId || randomUUID()
    const next = this.database.prepare("SELECT COALESCE(MAX(revision),0)+1 AS revision FROM creative_prompts WHERE id=?")
      .get(promptId) as { revision: number }
    const current = this.database.prepare("SELECT concept_id FROM creative_prompts WHERE id=? LIMIT 1").get(promptId) as { concept_id: string } | undefined
    if (current && current.concept_id !== input.conceptId) throw new Error("Prompt belongs to another concept.")
    this.database.prepare(`INSERT INTO creative_prompts (id,revision,concept_id,creative_text,origin,created_at) VALUES (?,?,?,?,?,?)`)
      .run(promptId, next.revision, input.conceptId, input.text, input.origin, new Date().toISOString())
    return { promptId, revision: next.revision }
  }

  listPromptVersions(conceptId: string) {
    return this.database.prepare(`SELECT id,revision,creative_text,created_at FROM creative_prompts WHERE concept_id=? ORDER BY id,revision`)
      .all(conceptId) as Array<{ id: string; revision: number; creative_text: string; created_at: string }>
  }

  createProject(investigationId: string, title: string) {
    const id = randomUUID()
    const now = new Date().toISOString()
    this.database.prepare(`INSERT INTO creative_projects (id,title,investigation_id,created_at,updated_at) VALUES (?,?,?,?,?)`)
      .run(id, title, investigationId, now, now)
    return id
  }

  createDesign(input: { projectId: string; conceptId: string; promptId: string; promptRevision: number }) {
    const project = this.database.prepare("SELECT investigation_id FROM creative_projects WHERE id=?")
      .get(input.projectId) as { investigation_id: string } | undefined
    const concept = this.database.prepare("SELECT investigation_id FROM creative_concepts WHERE id=?")
      .get(input.conceptId) as { investigation_id: string } | undefined
    const prompt = this.database.prepare("SELECT concept_id FROM creative_prompts WHERE id=? AND revision=?")
      .get(input.promptId, input.promptRevision) as { concept_id: string } | undefined
    if (!project || !concept || project.investigation_id !== concept.investigation_id || prompt?.concept_id !== input.conceptId) {
      throw new Error("Project, concept, and prompt must share a lineage.")
    }
    const id = randomUUID()
    this.database.prepare(`INSERT INTO creative_designs (id,project_id,concept_id,prompt_id,prompt_revision,created_at) VALUES (?,?,?,?,?,?)`)
      .run(id, input.projectId, input.conceptId, input.promptId, input.promptRevision, new Date().toISOString())
    return id
  }

  createGenerationConfig(input: { designId: string; productType: ProductType; provider: string; model?: string; aspectRatio?: string }) {
    const id = randomUUID()
    this.database.prepare(`INSERT INTO creative_generation_configs (id,design_id,product_type,provider,model,aspect_ratio,created_at) VALUES (?,?,?,?,?,?,?)`)
      .run(id, input.designId, input.productType, input.provider, input.model || null, input.aspectRatio || null, new Date().toISOString())
    return id
  }

  createGenerationJob(input: {
    designId: string; conceptId: string; promptId: string; promptRevision: number;
    configId: string; idempotencyKey: string
  }) {
    return this.database.transaction(() => {
      const existing = this.database.prepare("SELECT * FROM creative_generation_jobs WHERE idempotency_key=?")
        .get(input.idempotencyKey) as typeof input & { id: string; design_id: string; concept_id: string; prompt_id: string; prompt_revision: number; config_id: string } | undefined
      if (existing) {
        if (existing.design_id !== input.designId || existing.concept_id !== input.conceptId ||
            existing.prompt_id !== input.promptId || existing.prompt_revision !== input.promptRevision ||
            existing.config_id !== input.configId) throw new Error("Idempotency key belongs to another generation job.")
        return existing.id
      }
      const design = this.database.prepare("SELECT concept_id,prompt_id,prompt_revision FROM creative_designs WHERE id=?")
        .get(input.designId) as { concept_id: string; prompt_id: string; prompt_revision: number } | undefined
      const config = this.database.prepare("SELECT design_id FROM creative_generation_configs WHERE id=?")
        .get(input.configId) as { design_id: string } | undefined
      if (!design || design.concept_id !== input.conceptId || design.prompt_id !== input.promptId ||
          design.prompt_revision !== input.promptRevision || config?.design_id !== input.designId) {
        throw new Error("Generation job references do not match the design.")
      }
      const id = randomUUID()
      const now = new Date().toISOString()
      this.database.prepare(`INSERT INTO creative_generation_jobs
        (id,design_id,concept_id,prompt_id,prompt_revision,config_id,idempotency_key,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(id, input.designId, input.conceptId, input.promptId, input.promptRevision, input.configId, input.idempotencyKey, now, now)
      return id
    })()
  }
}
