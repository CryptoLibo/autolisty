import crypto from "node:crypto"
import type Database from "better-sqlite3"
import { pilotCapUsd } from "./budget"
import { getCompanyDatabase } from "./db"
import { LOCAL_DAILY_TOKEN_LIMITS, tokenGroup, utcDay } from "./quota"
import type { OfficialDailyBilling } from "./official-billing"
import type { AgentId } from "./agents"
import { DESIGN_PLAYBOOK_VERSION } from "./design-playbook"
import type { DesignConcept } from "./design-quality"
import { generateProductCode } from "../utils/generateListingId"

const now = () => new Date().toISOString()

export type CompanyTask = {
  id: string; conversation_id: string; status: string; stage: string; owner_message_id: string;
  research_question: string | null; report_id: string | null; design_brief: string | null; last_error: string | null;
  specialist_agent_id: string | null; specialist_question: string | null;
  image_requested: number;
  revision_root_id: string | null;
  created_at: string; updated_at: string
}

export class CompanyRepository {
  constructor(private db: Database.Database = getCompanyDatabase()) {}

  createConversation() {
    const id = crypto.randomUUID()
    this.db.prepare("INSERT INTO company_conversations(id,created_at,updated_at) VALUES(?,?,?)").run(id, now(), now())
    return id
  }

  getConversation(id: string) {
    return this.db.prepare("SELECT * FROM company_conversations WHERE id=?").get(id) as { id: string } | undefined
  }

  telegramConversation(chatId: string) {
    return this.db.transaction(() => {
      const existing = this.db.prepare("SELECT conversation_id FROM company_telegram_chats WHERE chat_id=?").get(chatId) as { conversation_id: string } | undefined
      if (existing) return existing.conversation_id
      const conversationId = this.createConversation()
      this.db.prepare("INSERT INTO company_telegram_chats(chat_id,conversation_id,created_at) VALUES(?,?,?)").run(chatId, conversationId, now())
      return conversationId
    })()
  }

  linkTelegramConversation(chatId: string, conversationId: string) {
    if (!this.getConversation(conversationId)) throw new Error("Conversation not found.")
    this.db.prepare(`INSERT INTO company_telegram_chats(chat_id,conversation_id,created_at) VALUES(?,?,?)
      ON CONFLICT(chat_id) DO UPDATE SET conversation_id=excluded.conversation_id`)
      .run(chatId, conversationId, now())
  }

  isTelegramConversation(chatId: string, conversationId: string) {
    const row = this.db.prepare("SELECT conversation_id FROM company_telegram_chats WHERE chat_id=?").get(chatId) as { conversation_id: string } | undefined
    return row?.conversation_id === conversationId
  }

  linkedTelegramConversation(chatId: string) {
    if (!chatId) return null
    const row = this.db.prepare("SELECT conversation_id FROM company_telegram_chats WHERE chat_id=?").get(chatId) as { conversation_id: string } | undefined
    return row?.conversation_id || null
  }

  receiveTelegramUpdate(updateId: number, chatId: string, content: string) {
    return this.db.transaction(() => {
      const existing = this.telegramUpdate(updateId)
      if (existing) return existing
      const taskId = this.addUserMessage(this.telegramConversation(chatId), content)
      const date = now()
      this.db.prepare("INSERT INTO company_telegram_updates(update_id,chat_id,task_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?)")
        .run(updateId, chatId, taskId, "PENDING", date, date)
      return this.telegramUpdate(updateId)!
    })()
  }

  telegramUpdate(updateId: number) {
    return this.db.prepare("SELECT update_id,chat_id,task_id,status,reply_text FROM company_telegram_updates WHERE update_id=?").get(updateId) as
      { update_id: number; chat_id: string; task_id: string | null; status: string; reply_text: string | null } | undefined
  }

  pendingTelegramUpdates(chatId: string) {
    return this.db.prepare("SELECT update_id FROM company_telegram_updates WHERE chat_id=? AND status IN ('PENDING','REPLY_READY') ORDER BY update_id LIMIT 20")
      .all(chatId) as Array<{ update_id: number }>
  }

  telegramReplyReady(updateId: number, reply: string) {
    this.db.prepare("UPDATE company_telegram_updates SET status='REPLY_READY',reply_text=?,updated_at=? WHERE update_id=? AND status='PENDING'")
      .run(reply, now(), updateId)
  }

  claimTelegramReply(updateId: number) {
    return this.db.prepare("UPDATE company_telegram_updates SET status='SENDING',updated_at=? WHERE update_id=? AND status='REPLY_READY'")
      .run(now(), updateId).changes === 1
  }

  telegramReplySent(updateId: number) {
    this.db.prepare("UPDATE company_telegram_updates SET status='SENT',updated_at=? WHERE update_id=? AND status='SENDING'").run(now(), updateId)
  }

  listConversations() {
    return this.db.prepare(`SELECT c.id,c.created_at,c.updated_at,
      (SELECT content FROM company_messages WHERE conversation_id=c.id AND role='user' ORDER BY created_at,id LIMIT 1) AS first_message
      FROM company_conversations c ORDER BY c.updated_at DESC LIMIT 50`).all()
  }

  addUserMessage(conversationId: string, content: string) {
    return this.db.transaction(() => {
      if (!this.getConversation(conversationId)) throw new Error("Conversation not found.")
      const active = this.db.prepare("SELECT id FROM company_tasks WHERE conversation_id=? AND status IN ('PENDING','RUNNING','RESEARCH_READY','DESIGN_READY','SPECIALIST_READY','SYNTHESIS_READY') LIMIT 1").get(conversationId)
      if (active) throw new Error("Finish the current response before sending another message.")
      const messageId = crypto.randomUUID()
      const taskId = crypto.randomUUID()
      const date = now()
      this.db.prepare("INSERT INTO company_messages(id,conversation_id,role,content,created_at) VALUES(?,?,?,?,?)").run(messageId, conversationId, "user", content, date)
      this.db.prepare("INSERT INTO company_tasks(id,conversation_id,status,stage,owner_message_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run(taskId, conversationId, "PENDING", "CEO_DECIDE", messageId, date, date)
      this.db.prepare("UPDATE company_conversations SET updated_at=? WHERE id=?").run(date, conversationId)
      this.event(taskId, "request_received", { messageId })
      return taskId
    })()
  }

  messages(conversationId: string) {
    return this.db.prepare("SELECT id,role,content,created_at FROM company_messages WHERE conversation_id=? ORDER BY created_at,id").all(conversationId) as Array<{ id: string; role: string; content: string; created_at: string }>
  }

  recentContext(conversationId: string) {
    const messages = this.messages(conversationId).slice(-12)
    const reports = this.db.prepare(`SELECT r.content,r.sources_json,r.created_at FROM company_reports r JOIN company_tasks t ON t.id=r.task_id
      WHERE t.conversation_id=? ORDER BY r.created_at DESC LIMIT 3`).all(conversationId)
    const artifacts = this.db.prepare(`SELECT a.kind,a.content,a.created_at FROM company_artifacts a JOIN company_tasks t ON t.id=a.task_id
      WHERE t.conversation_id=? ORDER BY a.rowid DESC LIMIT 4`).all(conversationId)
    return { messages, reports, artifacts }
  }

  task(id: string) {
    return this.db.prepare("SELECT * FROM company_tasks WHERE id=?").get(id) as CompanyTask | undefined
  }

  tasks(conversationId: string) {
    return this.db.prepare("SELECT * FROM company_tasks WHERE conversation_id=? ORDER BY created_at,id").all(conversationId) as CompanyTask[]
  }

  claimStage(taskId: string, stage: string) {
    const result = this.db.prepare("UPDATE company_tasks SET status='RUNNING',updated_at=? WHERE id=? AND stage=? AND status IN ('PENDING','RESEARCH_READY','DESIGN_READY','SPECIALIST_READY','SYNTHESIS_READY')").run(now(), taskId, stage)
    return result.changes === 1
  }

  stage(taskId: string, stage: string, status: string, details: Record<string, unknown> = {}) {
    this.db.transaction(() => {
      this.db.prepare("UPDATE company_tasks SET stage=?,status=?,research_question=COALESCE(?,research_question),design_brief=COALESCE(?,design_brief),specialist_agent_id=COALESCE(?,specialist_agent_id),specialist_question=COALESCE(?,specialist_question),image_requested=COALESCE(?,image_requested),updated_at=? WHERE id=?").run(
        stage, status, typeof details.researchQuestion === "string" ? details.researchQuestion : null,
        typeof details.designBrief === "string" ? details.designBrief : null,
        typeof details.specialistAgentId === "string" ? details.specialistAgentId : null,
        typeof details.specialistQuestion === "string" ? details.specialistQuestion : null,
        typeof details.imageRequested === "boolean" ? Number(details.imageRequested) : null,
        now(), taskId)
      if (typeof details.designBrief === "string" && details.designBrief.trim()) this.ensureDesignUnit(taskId, details.designBrief)
      this.event(taskId, "stage_changed", { stage, status })
    })()
  }

  ensureDesignUnit(taskId: string, title: string, projectId?: string) {
    return this.db.transaction(() => {
      const existing = this.designUnit(taskId)
      if (existing) {
        if (projectId && existing.project_id !== projectId) throw new Error("Design unit already belongs to another project.")
        return existing
      }
      if (!this.task(taskId)) throw new Error("Task not found.")
      const assignedProject = projectId || crypto.randomUUID()
      if (projectId) {
        const project = this.db.prepare("SELECT id FROM company_projects WHERE id=?").get(projectId)
        if (!project) throw new Error("Project not found.")
      } else {
        this.db.prepare("INSERT INTO company_projects(id,title,status,created_at) VALUES(?,?,?,?)")
          .run(assignedProject, title.trim().slice(0, 120), "PROPOSAL", now())
      }
      const unitId = crypto.randomUUID()
      this.db.prepare("INSERT INTO company_design_units(id,project_id,task_id,status,created_at) VALUES(?,?,?,?,?)")
        .run(unitId, assignedProject, taskId, "PROPOSAL", now())
      this.event(taskId, "design_unit_created", { projectId: assignedProject, unitId })
      return this.designUnit(taskId)!
    })()
  }

  designUnit(taskId: string) {
    return this.db.prepare("SELECT id,project_id,task_id,status FROM company_design_units WHERE task_id=?")
      .get(taskId) as { id: string; project_id: string; task_id: string; status: string } | undefined
  }

  project(id: string) {
    return this.db.prepare("SELECT id,title,status,created_at FROM company_projects WHERE id=?")
      .get(id) as { id: string; title: string; status: string; created_at: string } | undefined
  }

  projectUnits(projectId: string) {
    return this.db.prepare("SELECT id,project_id,task_id,status FROM company_design_units WHERE project_id=? ORDER BY rowid")
      .all(projectId) as Array<{ id: string; project_id: string; task_id: string; status: string }>
  }

  createListing(projectId: string, unitIds: string[]) {
    if (!unitIds.length || new Set(unitIds).size !== unitIds.length) throw new Error("A listing needs distinct design units.")
    return this.db.transaction(() => {
      if (!this.project(projectId)) throw new Error("Project not found.")
      const projectUnits = new Set(this.projectUnits(projectId).map((unit) => unit.id))
      if (unitIds.some((id) => !projectUnits.has(id))) throw new Error("All design units must belong to the listing project.")
      const id = crypto.randomUUID()
      let productCode: string | null = null
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const candidate = generateProductCode()
        try {
          this.db.prepare("INSERT INTO company_listings(id,project_id,product_code,status,created_at) VALUES(?,?,?,?,?)")
            .run(id, projectId, candidate, "PROPOSAL", now())
          productCode = candidate
          break
        } catch (error) {
          if (!String(error).includes("company_listings.product_code")) throw error
        }
      }
      if (!productCode) throw new Error("Unable to allocate a unique listing code.")
      const insertUnit = this.db.prepare("INSERT INTO company_listing_units(listing_id,unit_id) VALUES(?,?)")
      for (const unitId of unitIds) insertUnit.run(id, unitId)
      this.event(null, "listing_created", { listingId: id, projectId, productCode, unitIds })
      return { id, projectId, productCode, unitIds }
    })()
  }

  projectListings(projectId: string) {
    return this.db.prepare(`SELECT l.id,l.product_code,l.status,l.created_at,COUNT(u.unit_id) AS unit_count
      FROM company_listings l LEFT JOIN company_listing_units u ON u.listing_id=l.id
      WHERE l.project_id=? GROUP BY l.id ORDER BY l.created_at DESC`).all(projectId) as Array<{
        id: string; product_code: string | null; status: string; created_at: string; unit_count: number
      }>
  }

  overview() {
    const counts = this.db.prepare(`SELECT
      (SELECT COUNT(*) FROM company_projects) AS projects,
      (SELECT COUNT(*) FROM company_design_units) AS units,
      (SELECT COUNT(*) FROM company_listings) AS listings,
      (SELECT COUNT(*) FROM company_tasks WHERE status NOT IN ('COMPLETED','NEEDS_REVIEW')) AS running,
      (SELECT COUNT(*) FROM company_tasks WHERE status='NEEDS_REVIEW') AS incidents,
      (SELECT COUNT(*) FROM company_design_reviews WHERE verdict='approved') AS approvedDesigns`).get() as {
      projects: number; units: number; listings: number; running: number; incidents: number; approvedDesigns: number
    }
    const projects = this.db.prepare(`SELECT p.id,p.title,p.status,p.created_at,COUNT(u.id) AS units
      FROM company_projects p LEFT JOIN company_design_units u ON u.project_id=p.id
      GROUP BY p.id ORDER BY p.created_at DESC LIMIT 30`).all() as Array<{ id: string; title: string; status: string; created_at: string; units: number }>
    const listings = this.db.prepare(`SELECT l.id,l.project_id,l.product_code,l.status,l.created_at,p.title AS project_title,
      COUNT(u.unit_id) AS unit_count FROM company_listings l
      JOIN company_projects p ON p.id=l.project_id
      LEFT JOIN company_listing_units u ON u.listing_id=l.id
      GROUP BY l.id ORDER BY l.created_at DESC LIMIT 30`).all() as Array<{
        id: string; project_id: string; product_code: string | null; status: string; created_at: string; project_title: string; unit_count: number
      }>
    return { counts, projects, listings, budget: this.spend() }
  }

  complete(taskId: string, answer: string) {
    this.db.transaction(() => {
      const task = this.task(taskId)
      if (!task) throw new Error("Task not found.")
      const date = now()
      this.db.prepare("INSERT INTO company_messages(id,conversation_id,role,content,created_at) VALUES(?,?,?,?,?)").run(crypto.randomUUID(), task.conversation_id, "assistant", answer, date)
      this.db.prepare("UPDATE company_tasks SET stage='DONE',status='COMPLETED',updated_at=? WHERE id=?").run(date, taskId)
      this.db.prepare("UPDATE company_conversations SET updated_at=? WHERE id=?").run(date, task.conversation_id)
      this.event(taskId, "task_completed", {})
    })()
  }

  saveReport(taskId: string, content: string, sources: Array<{ title: string; url: string }>) {
    this.db.transaction(() => {
      const id = crypto.randomUUID()
      this.db.prepare("INSERT INTO company_reports(id,task_id,content,sources_json,created_at) VALUES(?,?,?,?,?)").run(id, taskId, content, JSON.stringify(sources), now())
      const unit = this.designUnit(taskId)
      if (unit) this.db.prepare("INSERT INTO company_project_artifacts(id,project_id,kind,content,source_task_id,created_at) VALUES(?,?,?,?,?,?)")
        .run(crypto.randomUUID(), unit.project_id, "market_research", content, taskId, now())
      const nextStage = this.task(taskId)?.design_brief ? "PRODUCT_PLAN" : "CEO_SYNTHESIZE"
      const nextStatus = nextStage === "PRODUCT_PLAN" ? "DESIGN_READY" : "SYNTHESIS_READY"
      this.db.prepare("UPDATE company_tasks SET report_id=?,stage=?,status=?,updated_at=? WHERE id=?").run(id, nextStage, nextStatus, now(), taskId)
      this.event(taskId, "research_delivered", { reportId: id, sourceCount: sources.length })
    })()
  }

  report(taskId: string) {
    return this.db.prepare("SELECT * FROM company_reports WHERE task_id=?").get(taskId) as { content: string; sources_json: string } | undefined
  }

  saveArtifact(taskId: string, kind: "product_brief" | "design_concepts", content: string, data?: { concepts: DesignConcept[] }) {
    if (!content.trim()) throw new Error("Agent returned an empty artifact.")
    this.db.transaction(() => {
      const task = this.task(taskId)
      if (!task || task.status !== "RUNNING" ||
        (kind === "product_brief" && task.stage !== "PRODUCT_PLAN") ||
        (kind === "design_concepts" && task.stage !== "VISUAL_DESIGN")) throw new Error("Unexpected artifact stage.")
      const nextStage = kind === "product_brief" ? "VISUAL_DESIGN" : task.image_requested ? "KITTL_SELECT" : "CEO_SYNTHESIZE"
      const nextStatus = kind === "product_brief" || task.image_requested ? "DESIGN_READY" : "SYNTHESIS_READY"
      this.db.prepare("INSERT INTO company_artifacts(id,task_id,kind,content,created_at,data_json) VALUES(?,?,?,?,?,?)")
        .run(crypto.randomUUID(), taskId, kind, content.trim(), now(), data ? JSON.stringify(data) : null)
      this.db.prepare("UPDATE company_tasks SET stage=?,status=?,updated_at=? WHERE id=?")
        .run(nextStage, nextStatus, now(), taskId)
      this.event(taskId, "artifact_delivered", { kind })
    })()
  }

  recordKittlSelection(taskId: string, selection: { concept_index: number; model_id: string; aspect_ratio: string; reason: string }) {
    const task = this.task(taskId)
    if (!task || task.stage !== "KITTL_SELECT" || task.status !== "RUNNING" || !task.image_requested) throw new Error("Unexpected Kittl selection stage.")
    this.db.prepare("INSERT INTO company_artifacts(id,task_id,kind,content,created_at,data_json) VALUES(?,?,?,?,?,?)")
      .run(crypto.randomUUID(), taskId, "kittl_selection", selection.reason.slice(0, 500), now(), JSON.stringify(selection))
    this.event(taskId, "kittl_model_selected", { conceptIndex: selection.concept_index, modelId: selection.model_id })
  }

  createImageRevision(chatId: string, generation: { id: string; task_id: string; prompt: string }, feedback: string, updateId: number) {
    return this.db.transaction(() => {
      if (this.telegramUpdate(updateId)) return null
      const original = this.task(generation.task_id)
      if (!original) throw new Error("Original design task not found.")
      const root = original.revision_root_id || generation.id
      const count = this.db.prepare("SELECT COUNT(*) AS count FROM company_tasks WHERE revision_root_id=?").get(root) as { count: number }
      if (count.count >= 3) {
        this.db.prepare("INSERT INTO company_telegram_updates(update_id,chat_id,status,created_at,updated_at) VALUES(?,?,'FEEDBACK',?,?)")
          .run(updateId, chatId, now(), now())
        return null
      }
      const conversationId = this.telegramConversation(chatId)
      const request = `Revisa la imagen de Kittl. Mi comentario: ${feedback}. Prompt anterior: ${generation.prompt}`
      const taskId = this.addUserMessage(conversationId, request)
      this.db.prepare("UPDATE company_tasks SET revision_root_id=? WHERE id=?").run(root, taskId)
      const projectId = this.designUnit(generation.task_id)?.project_id
      if (projectId) this.ensureDesignUnit(taskId, `Revisión: ${feedback.slice(0, 80)}`, projectId)
      const priorBrief = this.artifact(generation.task_id, "product_brief")?.content || original.design_brief || ""
      this.stage(taskId, "PRODUCT_PLAN", "DESIGN_READY", {
        designBrief: `${priorBrief}\nPrompt anterior: ${generation.prompt}\nCorrecciones solicitadas por el propietario: ${feedback}`.slice(0, 5500),
        imageRequested: true,
      })
      this.db.prepare("INSERT INTO company_telegram_updates(update_id,chat_id,task_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?)")
        .run(updateId, chatId, taskId, "PENDING", now(), now())
      this.event(taskId, "image_revision_requested", { priorGenerationId: generation.id, rootGenerationId: root, revision: count.count + 1 })
      return taskId
    })()
  }

  saveSpecialistResult(taskId: string, content: string) {
    if (!content.trim()) throw new Error("Specialist returned an empty result.")
    this.db.transaction(() => {
      const task = this.task(taskId)
      if (!task || task.status !== "RUNNING" || task.stage !== "SPECIALIST" || !task.specialist_agent_id) {
        throw new Error("Unexpected specialist result stage.")
      }
      this.db.prepare("INSERT INTO company_artifacts(id,task_id,kind,content,created_at,data_json) VALUES(?,?,?,?,?,NULL)")
        .run(crypto.randomUUID(), taskId, "specialist_result", content.trim(), now())
      this.db.prepare("UPDATE company_tasks SET stage='CEO_SYNTHESIZE',status='SYNTHESIS_READY',updated_at=? WHERE id=?")
        .run(now(), taskId)
      this.event(taskId, "specialist_result_delivered", { agentId: task.specialist_agent_id })
    })()
  }

  artifact(taskId: string, kind: "product_brief" | "design_concepts" | "specialist_result" | "kittl_selection") {
    return this.db.prepare("SELECT id,kind,content,created_at,data_json FROM company_artifacts WHERE task_id=? AND kind=?")
      .get(taskId, kind) as { id: string; kind: string; content: string; created_at: string; data_json: string | null } | undefined
  }

  designReviews(taskId: string) {
    return this.db.prepare("SELECT concept_index,verdict,notes,kittl_url,prompt_snapshot,playbook_version,updated_at FROM company_design_reviews WHERE task_id=? ORDER BY concept_index")
      .all(taskId) as Array<{ concept_index: number; verdict: string; notes: string; kittl_url: string | null; prompt_snapshot: string; playbook_version: number; updated_at: string }>
  }

  saveDesignReview(taskId: string, conceptIndex: number, verdict: "approved" | "revise", notes: string, kittlUrl: string | null) {
    if (verdict === "approved" && !kittlUrl) throw new Error("A Kittl result link is required before approving a design.")
    const task = this.task(taskId)
    if (!task || task.status !== "COMPLETED") throw new Error("Completed design task not found.")
    const data = this.artifact(taskId, "design_concepts")?.data_json
    const concepts = data ? (JSON.parse(data) as { concepts: DesignConcept[] }).concepts : null
    if (!concepts || !Number.isInteger(conceptIndex) || conceptIndex < 0 || conceptIndex >= concepts.length) throw new Error("Design concept not found.")
    const prompt = concepts[conceptIndex].prompt
    this.db.prepare(`INSERT INTO company_design_reviews(task_id,concept_index,verdict,notes,kittl_url,prompt_snapshot,playbook_version,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(task_id,concept_index) DO UPDATE SET verdict=excluded.verdict,notes=excluded.notes,kittl_url=excluded.kittl_url,prompt_snapshot=excluded.prompt_snapshot,playbook_version=excluded.playbook_version,updated_at=excluded.updated_at`)
      .run(taskId, conceptIndex, verdict, notes, kittlUrl, prompt, DESIGN_PLAYBOOK_VERSION, now(), now())
    this.event(taskId, "design_review_saved", { conceptIndex, verdict, hasKittlUrl: !!kittlUrl, playbookVersion: DESIGN_PLAYBOOK_VERSION })
    return this.designReviews(taskId)
  }

  relevantDesignExamples(brief: string, limit = 2) {
    const words = new Set((brief.toLocaleLowerCase("en").match(/[\p{L}]{4,}/gu) || []).filter((word) => !["para", "with", "design", "producto", "conceptos", "vertical", "brief"].includes(word)))
    const rows = this.db.prepare(`SELECT r.prompt_snapshot,r.notes,a.content AS brief FROM company_design_reviews r
      JOIN company_artifacts a ON a.task_id=r.task_id AND a.kind='product_brief'
      WHERE r.verdict='approved' ORDER BY r.updated_at DESC LIMIT 30`).all() as Array<{ prompt_snapshot: string; notes: string; brief: string }>
    return rows.map((row) => ({ ...row, score: (row.brief.toLocaleLowerCase("en").match(/[\p{L}]{4,}/gu) || []).filter((word) => words.has(word)).length }))
      .filter((row) => row.score >= 2).sort((a, b) => b.score - a.score).slice(0, limit)
      .map(({ prompt_snapshot, notes }) => ({ prompt: prompt_snapshot, ownerNotes: notes.slice(0, 300) }))
  }

  projectArtifacts(projectId: string, kind: string) {
    return this.db.prepare("SELECT id,kind,content,source_task_id,created_at FROM company_project_artifacts WHERE project_id=? AND kind=? ORDER BY rowid DESC")
      .all(projectId, kind) as Array<{ id: string; kind: string; content: string; source_task_id: string | null; created_at: string }>
  }

  artifacts(taskId: string) {
    return this.db.prepare("SELECT id,kind,content,created_at,data_json FROM company_artifacts WHERE task_id=? ORDER BY rowid")
      .all(taskId) as Array<{ id: string; kind: string; content: string; created_at: string; data_json: string | null }>
  }

  reuseRecentReport(taskId: string, question: string, days = 7) {
    const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("es").replace(/\s+/g, " ").trim()
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()
    const rows = this.db.prepare(`SELECT t.id AS source_task_id,t.research_question,r.content,r.sources_json
      FROM company_reports r JOIN company_tasks t ON t.id=r.task_id
      WHERE t.id<>? AND t.status='COMPLETED' AND r.created_at>=?
      ORDER BY r.created_at DESC LIMIT 50`).all(taskId, cutoff) as Array<{ source_task_id: string; research_question: string; content: string; sources_json: string }>
    const match = rows.find((row) => row.research_question && normalize(row.research_question) === normalize(question))
    if (!match) return false
    this.saveReport(taskId, match.content, JSON.parse(match.sources_json) as Array<{ title: string; url: string }>)
    this.event(taskId, "research_reused", { sourceTaskId: match.source_task_id })
    return true
  }

  event(taskId: string | null, eventType: string, details: Record<string, unknown>) {
    this.db.prepare("INSERT INTO company_events(task_id,event_type,detail_json,created_at) VALUES(?,?,?,?)").run(taskId, eventType, JSON.stringify(details), now())
  }

  events(taskId: string) {
    return this.db.prepare("SELECT event_type,detail_json,created_at FROM company_events WHERE task_id=? ORDER BY id").all(taskId) as Array<{ event_type: string; detail_json: string; created_at: string }>
  }

  spend() {
    const row = this.db.prepare(`SELECT COALESCE(SUM(CASE WHEN status='COMPLETED' THEN model_usd+tool_usd WHEN status='FAILED_NO_CHARGE' THEN 0 ELSE reserved_usd END),0) AS total,
      COALESCE(SUM(model_usd),0) AS model,
      COALESCE(SUM(tool_usd),0) AS tools
      FROM company_calls`).get() as { total: number; model: number; tools: number }
    return { ...row, cap: pilotCapUsd(), remaining: Math.max(0, pilotCapUsd() - row.total) }
  }

  externalCredits(provider: string) {
    const month = now().slice(0, 7)
    return this.db.prepare(`SELECT COALESCE(SUM(COALESCE(actual_credits,reserved_credits)),0) AS used,
      COUNT(*) AS requests FROM company_external_credits WHERE provider=? AND created_at>=?`).get(provider, `${month}-01T00:00:00.000Z`) as { used: number; requests: number }
  }

  reserveExternalCredits(taskId: string, provider: string, credits: number, cap: number) {
    if (!Number.isSafeInteger(credits) || credits <= 0 || !Number.isSafeInteger(cap) || cap <= 0) {
      throw new Error("External credit reservation and cap must be positive integers.")
    }
    return this.db.transaction(() => {
      const usage = this.externalCredits(provider)
      if (usage.used + credits > cap) throw new Error(`${provider} credit cap exhausted: ${usage.used}/${cap} credits committed.`)
      const id = crypto.randomUUID()
      this.db.prepare("INSERT INTO company_external_credits(id,task_id,provider,status,reserved_credits,created_at) VALUES(?,?,?,?,?,?)")
        .run(id, taskId, provider, "IN_FLIGHT", credits, now())
      this.event(taskId, "external_credits_reserved", { provider, credits, cap, reservationId: id })
      return id
    })()
  }

  finishExternalCredits(id: string, actualCredits: number, remainingCredits: number | null) {
    if (!Number.isSafeInteger(actualCredits) || actualCredits < 0) throw new Error("Invalid external credit charge.")
    this.db.transaction(() => {
      const result = this.db.prepare(`UPDATE company_external_credits SET status='COMPLETED',actual_credits=?,remaining_credits=?,completed_at=?
        WHERE id=? AND status='IN_FLIGHT'`).run(actualCredits, remainingCredits, now(), id)
      if (result.changes !== 1) throw new Error("External credit reservation not found or already completed.")
      const row = this.db.prepare("SELECT task_id,provider FROM company_external_credits WHERE id=?").get(id) as { task_id: string; provider: string }
      this.event(row.task_id, "external_credits_charged", { provider: row.provider, credits: actualCredits, remainingCredits, reservationId: id })
    })()
  }

  markExternalCreditsUnknown(id: string) {
    this.db.prepare("UPDATE company_external_credits SET status='UNKNOWN',completed_at=? WHERE id=? AND status='IN_FLIGHT'").run(now(), id)
  }

  localDailyTokens(day = utcDay()) {
    const rows = this.db.prepare(`SELECT model,COALESCE(SUM(input_tokens+output_tokens),0) AS tokens
      FROM company_calls WHERE status='COMPLETED' AND created_at>=? AND created_at<? GROUP BY model`)
      .all(`${day}T00:00:00.000Z`, `${day}T23:59:59.999Z`) as Array<{ model: string; tokens: number }>
    const used = { main: 0, economy: 0 }
    for (const row of rows) {
      const group = tokenGroup(row.model)
      if (group) used[group] += row.tokens
    }
    return {
      dayUtc: day,
      scope: "company_local_only" as const,
      main: { used: used.main, limit: LOCAL_DAILY_TOKEN_LIMITS.main },
      economy: { used: used.economy, limit: LOCAL_DAILY_TOKEN_LIMITS.economy },
    }
  }

  saveOfficialDailyBilling(snapshot: OfficialDailyBilling) {
    this.db.prepare(`INSERT INTO company_official_daily(project_id,day_utc,billed_usd,usage_json,costs_json,fetched_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(project_id,day_utc) DO UPDATE SET
      billed_usd=excluded.billed_usd,usage_json=excluded.usage_json,costs_json=excluded.costs_json,fetched_at=excluded.fetched_at`)
      .run(snapshot.projectId, snapshot.dayUtc, snapshot.billedUsd, JSON.stringify(snapshot.usage), JSON.stringify(snapshot.costs), now())
  }

  officialDailyBilling(projectId: string, day = utcDay()) {
    return this.db.prepare("SELECT project_id,day_utc,billed_usd,usage_json,costs_json,fetched_at FROM company_official_daily WHERE project_id=? AND day_utc=?")
      .get(projectId, day) as { project_id: string; day_utc: string; billed_usd: number; usage_json: string; costs_json: string; fetched_at: string } | undefined
  }

  reserveCall(taskId: string, agentId: AgentId, model: string, reserveUsd: number) {
    return this.db.transaction(() => {
      const budget = this.spend()
      if (budget.remaining < reserveUsd) throw new Error(`Pilot budget exhausted: $${budget.remaining.toFixed(3)} remaining; $${reserveUsd.toFixed(3)} required.`)
      const id = crypto.randomUUID()
      this.db.prepare("INSERT INTO company_calls(id,task_id,agent_id,model,status,reserved_usd,created_at) VALUES(?,?,?,?,?,?,?)").run(id, taskId, agentId, model, "IN_FLIGHT", reserveUsd, now())
      this.event(taskId, "model_call_reserved", { callId: id, agentId, model, reserveUsd })
      return id
    })()
  }

  finishCall(callId: string, info: { modelUsd: number; toolUsd: number; inputTokens: number; cachedTokens: number; outputTokens: number; webCalls: number; responseId: string }) {
    this.db.transaction(() => {
      this.db.prepare(`UPDATE company_calls SET status='COMPLETED',model_usd=?,tool_usd=?,input_tokens=?,cached_tokens=?,output_tokens=?,web_calls=?,provider_response_id=?,completed_at=? WHERE id=? AND status='IN_FLIGHT'`).run(info.modelUsd, info.toolUsd, info.inputTokens, info.cachedTokens, info.outputTokens, info.webCalls, info.responseId, now(), callId)
      const call = this.db.prepare("SELECT task_id FROM company_calls WHERE id=?").get(callId) as { task_id: string }
      this.event(call.task_id, "model_call_completed", { callId, ...info })
    })()
  }

  failCall(callId: string, error: string, knownUnbilled = false) {
    this.db.prepare("UPDATE company_calls SET status=?,error=?,completed_at=? WHERE id=? AND status='IN_FLIGHT'").run(knownUnbilled ? "FAILED_NO_CHARGE" : "UNCERTAIN", error, now(), callId)
  }

  failTask(taskId: string, error: string) {
    this.db.prepare("UPDATE company_tasks SET status='NEEDS_REVIEW',last_error=?,updated_at=? WHERE id=?").run(error, now(), taskId)
    this.event(taskId, "task_needs_review", { error })
  }

  recoverInterrupted() {
    const cutoff = new Date(Date.now() - 10 * 60_000).toISOString()
    const stale = this.db.prepare("SELECT id FROM company_tasks WHERE status='RUNNING' AND updated_at<?").all(cutoff) as Array<{ id: string }>
    for (const task of stale) this.failTask(task.id, "Interrupted during a model call; review before retry to avoid duplicate charges.")
    return stale.length
  }

  calls(taskId: string) {
    return this.db.prepare("SELECT agent_id,model,status,reserved_usd,model_usd,tool_usd,input_tokens,cached_tokens,output_tokens,web_calls,created_at,error FROM company_calls WHERE task_id=? ORDER BY created_at").all(taskId)
  }

  agentConfig(agentId: AgentId) {
    const row = this.db.prepare(`SELECT a.id,a.name,a.role,a.model,a.tools_json,a.active_instruction_version,i.instructions
      FROM company_agents a JOIN company_agent_instructions i ON i.agent_id=a.id AND i.version=a.active_instruction_version WHERE a.id=?`).get(agentId) as {
        id: AgentId; name: string; role: string; model: string; tools_json: string; active_instruction_version: number; instructions: string
      } | undefined
    if (!row) throw new Error(`Agent ${agentId} is not configured.`)
    return { ...row, tools: JSON.parse(row.tools_json) as string[] }
  }

  renameAgent(agentId: AgentId, name: string) {
    const normalized = name.trim()
    if (!normalized || normalized.length > 40 || /[\r\n<>]/.test(normalized)) throw new Error("Agent name must contain 1-40 plain characters.")
    const changed = this.db.prepare("UPDATE company_agents SET name=? WHERE id=?").run(normalized, agentId).changes
    if (!changed) throw new Error("Agent not found.")
    return this.agentConfig(agentId)
  }
}
