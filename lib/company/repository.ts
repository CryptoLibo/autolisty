import crypto from "node:crypto"
import type Database from "better-sqlite3"
import { pilotCapUsd } from "./budget"
import { getCompanyDatabase } from "./db"
import { LOCAL_DAILY_TOKEN_LIMITS, tokenGroup, utcDay } from "./quota"
import type { OfficialDailyBilling } from "./official-billing"
import type { AgentId } from "./agents"

const now = () => new Date().toISOString()

export type CompanyTask = {
  id: string; conversation_id: string; status: string; stage: string; owner_message_id: string;
  research_question: string | null; report_id: string | null; last_error: string | null;
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
      const active = this.db.prepare("SELECT id FROM company_tasks WHERE conversation_id=? AND status IN ('PENDING','RUNNING','RESEARCH_READY','SYNTHESIS_READY') LIMIT 1").get(conversationId)
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
    return { messages, reports }
  }

  task(id: string) {
    return this.db.prepare("SELECT * FROM company_tasks WHERE id=?").get(id) as CompanyTask | undefined
  }

  tasks(conversationId: string) {
    return this.db.prepare("SELECT * FROM company_tasks WHERE conversation_id=? ORDER BY created_at,id").all(conversationId) as CompanyTask[]
  }

  claimStage(taskId: string, stage: string) {
    const result = this.db.prepare("UPDATE company_tasks SET status='RUNNING',updated_at=? WHERE id=? AND stage=? AND status IN ('PENDING','RESEARCH_READY','SYNTHESIS_READY')").run(now(), taskId, stage)
    return result.changes === 1
  }

  stage(taskId: string, stage: string, status: string, details: Record<string, unknown> = {}) {
    this.db.transaction(() => {
      this.db.prepare("UPDATE company_tasks SET stage=?,status=?,research_question=COALESCE(?,research_question),updated_at=? WHERE id=?").run(stage, status, typeof details.researchQuestion === "string" ? details.researchQuestion : null, now(), taskId)
      this.event(taskId, "stage_changed", { stage, status })
    })()
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
      this.db.prepare("UPDATE company_tasks SET report_id=?,stage='CEO_SYNTHESIZE',status='SYNTHESIS_READY',updated_at=? WHERE id=?").run(id, now(), taskId)
      this.event(taskId, "research_delivered", { reportId: id, sourceCount: sources.length })
    })()
  }

  report(taskId: string) {
    return this.db.prepare("SELECT * FROM company_reports WHERE task_id=?").get(taskId) as { content: string; sources_json: string } | undefined
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
