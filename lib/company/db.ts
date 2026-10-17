import fs from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"
import { AGENTS } from "./agents"
import { modelFor } from "./agents"

type GlobalDb = typeof globalThis & { __companyDb?: Database.Database; __companyDbPath?: string }

export function openCompanyDatabase(databasePath?: string) {
  const configured = databasePath || process.env.COMPANY_DB_PATH
  if (!configured && process.env.NODE_ENV === "production") throw new Error("COMPANY_DB_PATH is required in production.")
  const resolved = configured || path.join(process.cwd(), "data", "autolisty-company.sqlite")
  if (resolved !== ":memory:" && !path.isAbsolute(resolved)) throw new Error("COMPANY_DB_PATH must be absolute.")
  if (resolved !== ":memory:") fs.mkdirSync(path.dirname(resolved), { recursive: true })
  const db = new Database(resolved)
  db.pragma("foreign_keys = ON")
  db.pragma("busy_timeout = 5000")
  db.pragma("journal_mode = WAL")
  db.pragma("synchronous = FULL")
  db.exec(`
    CREATE TABLE IF NOT EXISTS company_agents (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, active_instruction_version INTEGER NOT NULL, model TEXT NOT NULL, tools_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS company_agent_instructions (agent_id TEXT NOT NULL, version INTEGER NOT NULL, instructions TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(agent_id, version), FOREIGN KEY(agent_id) REFERENCES company_agents(id));
    CREATE TABLE IF NOT EXISTS company_conversations (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS company_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(conversation_id) REFERENCES company_conversations(id));
    CREATE INDEX IF NOT EXISTS company_messages_conversation_idx ON company_messages(conversation_id, created_at);
    CREATE TABLE IF NOT EXISTS company_tasks (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, status TEXT NOT NULL, stage TEXT NOT NULL, owner_message_id TEXT NOT NULL, research_question TEXT, report_id TEXT, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(conversation_id) REFERENCES company_conversations(id));
    CREATE INDEX IF NOT EXISTS company_tasks_status_idx ON company_tasks(status, updated_at);
    CREATE TABLE IF NOT EXISTS company_reports (id TEXT PRIMARY KEY, task_id TEXT NOT NULL UNIQUE, content TEXT NOT NULL, sources_json TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(task_id) REFERENCES company_tasks(id));
    CREATE TABLE IF NOT EXISTS company_events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, event_type TEXT NOT NULL, detail_json TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS company_calls (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, agent_id TEXT NOT NULL, model TEXT NOT NULL, status TEXT NOT NULL, reserved_usd REAL NOT NULL, model_usd REAL NOT NULL DEFAULT 0, tool_usd REAL NOT NULL DEFAULT 0, input_tokens INTEGER, cached_tokens INTEGER, output_tokens INTEGER, web_calls INTEGER, provider_response_id TEXT, error TEXT, created_at TEXT NOT NULL, completed_at TEXT, FOREIGN KEY(task_id) REFERENCES company_tasks(id), FOREIGN KEY(agent_id) REFERENCES company_agents(id));
    CREATE INDEX IF NOT EXISTS company_calls_task_idx ON company_calls(task_id, created_at);
    CREATE TABLE IF NOT EXISTS company_official_daily (project_id TEXT NOT NULL, day_utc TEXT NOT NULL, billed_usd REAL NOT NULL, usage_json TEXT NOT NULL, costs_json TEXT NOT NULL, fetched_at TEXT NOT NULL, PRIMARY KEY(project_id, day_utc));
    CREATE TABLE IF NOT EXISTS company_telegram_chats (chat_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(conversation_id) REFERENCES company_conversations(id));
    CREATE TABLE IF NOT EXISTS company_telegram_updates (update_id INTEGER PRIMARY KEY, chat_id TEXT NOT NULL, task_id TEXT, status TEXT NOT NULL, reply_text TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(task_id) REFERENCES company_tasks(id));
    CREATE INDEX IF NOT EXISTS company_telegram_updates_status_idx ON company_telegram_updates(status, updated_at);
  `)
  for (const agent of Object.values(AGENTS)) {
    db.prepare("INSERT OR IGNORE INTO company_agents(id,name,role,active_instruction_version,model,tools_json) VALUES(?,?,?,?,?,?)").run(agent.id, agent.name, agent.role, agent.version, agent.defaultModel, JSON.stringify(agent.tools))
    db.prepare("INSERT OR IGNORE INTO company_agent_instructions(agent_id,version,instructions,created_at) VALUES(?,?,?,?)").run(agent.id, agent.version, agent.instructions, new Date().toISOString())
    db.prepare("UPDATE company_agents SET model=? WHERE id=?").run(modelFor(agent.id), agent.id)
  }
  db.prepare("UPDATE company_agents SET name='James' WHERE id='ceo' AND name='CEO'").run()
  return db
}

export function getCompanyDatabase() {
  const state = globalThis as GlobalDb
  const configured = process.env.COMPANY_DB_PATH || path.join(process.cwd(), "data", "autolisty-company.sqlite")
  if (!state.__companyDb || state.__companyDbPath !== configured) {
    state.__companyDb?.close()
    state.__companyDb = openCompanyDatabase(configured)
    state.__companyDbPath = configured
  }
  return state.__companyDb
}
