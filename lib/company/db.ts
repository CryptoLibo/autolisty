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
    CREATE TABLE IF NOT EXISTS company_projects (id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS company_design_units (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, task_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(project_id) REFERENCES company_projects(id), FOREIGN KEY(task_id) REFERENCES company_tasks(id));
    CREATE INDEX IF NOT EXISTS company_design_units_project_idx ON company_design_units(project_id);
    CREATE TABLE IF NOT EXISTS company_listings (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(project_id) REFERENCES company_projects(id));
    CREATE TABLE IF NOT EXISTS company_listing_units (listing_id TEXT NOT NULL, unit_id TEXT NOT NULL, PRIMARY KEY(listing_id,unit_id), FOREIGN KEY(listing_id) REFERENCES company_listings(id), FOREIGN KEY(unit_id) REFERENCES company_design_units(id));
    CREATE TABLE IF NOT EXISTS company_project_artifacts (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL, content TEXT NOT NULL, source_task_id TEXT, created_at TEXT NOT NULL, FOREIGN KEY(project_id) REFERENCES company_projects(id), FOREIGN KEY(source_task_id) REFERENCES company_tasks(id));
    CREATE TABLE IF NOT EXISTS company_reports (id TEXT PRIMARY KEY, task_id TEXT NOT NULL UNIQUE, content TEXT NOT NULL, sources_json TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(task_id) REFERENCES company_tasks(id));
    CREATE TABLE IF NOT EXISTS company_artifacts (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, kind TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(task_id,kind), FOREIGN KEY(task_id) REFERENCES company_tasks(id));
    CREATE TABLE IF NOT EXISTS company_design_reviews (task_id TEXT NOT NULL, concept_index INTEGER NOT NULL, verdict TEXT NOT NULL, notes TEXT NOT NULL, kittl_url TEXT, prompt_snapshot TEXT NOT NULL, playbook_version INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(task_id,concept_index), FOREIGN KEY(task_id) REFERENCES company_tasks(id));
    CREATE TABLE IF NOT EXISTS company_events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, event_type TEXT NOT NULL, detail_json TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS company_calls (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, agent_id TEXT NOT NULL, model TEXT NOT NULL, status TEXT NOT NULL, reserved_usd REAL NOT NULL, model_usd REAL NOT NULL DEFAULT 0, tool_usd REAL NOT NULL DEFAULT 0, input_tokens INTEGER, cached_tokens INTEGER, output_tokens INTEGER, web_calls INTEGER, provider_response_id TEXT, error TEXT, created_at TEXT NOT NULL, completed_at TEXT, FOREIGN KEY(task_id) REFERENCES company_tasks(id), FOREIGN KEY(agent_id) REFERENCES company_agents(id));
    CREATE INDEX IF NOT EXISTS company_calls_task_idx ON company_calls(task_id, created_at);
    CREATE TABLE IF NOT EXISTS company_external_credits (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, provider TEXT NOT NULL, status TEXT NOT NULL, reserved_credits INTEGER NOT NULL, actual_credits INTEGER, remaining_credits INTEGER, created_at TEXT NOT NULL, completed_at TEXT, FOREIGN KEY(task_id) REFERENCES company_tasks(id));
    CREATE INDEX IF NOT EXISTS company_external_credits_provider_idx ON company_external_credits(provider, created_at);
    CREATE TABLE IF NOT EXISTS company_official_daily (project_id TEXT NOT NULL, day_utc TEXT NOT NULL, billed_usd REAL NOT NULL, usage_json TEXT NOT NULL, costs_json TEXT NOT NULL, fetched_at TEXT NOT NULL, PRIMARY KEY(project_id, day_utc));
    CREATE TABLE IF NOT EXISTS company_integrations (id TEXT PRIMARY KEY, encrypted_state TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS company_worker_heartbeat (id TEXT PRIMARY KEY, seen_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS company_voice_usage (id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL, reserved_usd REAL NOT NULL, estimated_usd REAL, duration_seconds REAL, characters INTEGER, created_at TEXT NOT NULL, completed_at TEXT);
    CREATE INDEX IF NOT EXISTS company_voice_usage_day_idx ON company_voice_usage(created_at);
    CREATE TABLE IF NOT EXISTS company_kittl_generations (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, concept_index INTEGER NOT NULL, prompt TEXT NOT NULL, model_id TEXT NOT NULL, workspace_id TEXT NOT NULL, reservation_id TEXT, job_id TEXT, status TEXT NOT NULL, image_url TEXT, edit_url TEXT, credit_cost INTEGER, telegram_message_id INTEGER, review_status TEXT, feedback TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(task_id) REFERENCES company_tasks(id));
    CREATE INDEX IF NOT EXISTS company_kittl_generations_status_idx ON company_kittl_generations(status, updated_at);
    CREATE TABLE IF NOT EXISTS company_telegram_chats (chat_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(conversation_id) REFERENCES company_conversations(id));
    CREATE TABLE IF NOT EXISTS company_telegram_updates (update_id INTEGER PRIMARY KEY, chat_id TEXT NOT NULL, task_id TEXT, status TEXT NOT NULL, reply_text TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(task_id) REFERENCES company_tasks(id));
    CREATE INDEX IF NOT EXISTS company_telegram_updates_status_idx ON company_telegram_updates(status, updated_at);
  `)
  const taskColumns = db.pragma("table_info(company_tasks)") as Array<{ name: string }>
  if (!taskColumns.some((column) => column.name === "design_brief")) {
    db.exec("ALTER TABLE company_tasks ADD COLUMN design_brief TEXT")
  }
  if (!taskColumns.some((column) => column.name === "specialist_agent_id")) {
    db.exec("ALTER TABLE company_tasks ADD COLUMN specialist_agent_id TEXT")
  }
  if (!taskColumns.some((column) => column.name === "specialist_question")) {
    db.exec("ALTER TABLE company_tasks ADD COLUMN specialist_question TEXT")
  }
  if (!taskColumns.some((column) => column.name === "image_requested")) {
    db.exec("ALTER TABLE company_tasks ADD COLUMN image_requested INTEGER NOT NULL DEFAULT 0")
  }
  if (!taskColumns.some((column) => column.name === "revision_root_id")) {
    db.exec("ALTER TABLE company_tasks ADD COLUMN revision_root_id TEXT")
  }
  const generationColumns = db.pragma("table_info(company_kittl_generations)") as Array<{ name: string }>
  if (!generationColumns.some((column) => column.name === "aspect_ratio")) {
    db.exec("ALTER TABLE company_kittl_generations ADD COLUMN aspect_ratio TEXT NOT NULL DEFAULT '1:1'")
  }
  if (!generationColumns.some((column) => column.name === "image_path")) {
    db.exec("ALTER TABLE company_kittl_generations ADD COLUMN image_path TEXT")
  }
  const telegramColumns = db.pragma("table_info(company_telegram_updates)") as Array<{ name: string }>
  if (!telegramColumns.some((column) => column.name === "telegram_message_id")) {
    db.exec("ALTER TABLE company_telegram_updates ADD COLUMN telegram_message_id INTEGER")
  }
  const artifactColumns = db.pragma("table_info(company_artifacts)") as Array<{ name: string }>
  if (!artifactColumns.some((column) => column.name === "data_json")) {
    db.exec("ALTER TABLE company_artifacts ADD COLUMN data_json TEXT")
  }
  const listingColumns = db.pragma("table_info(company_listings)") as Array<{ name: string }>
  if (!listingColumns.some((column) => column.name === "product_code")) {
    db.exec("ALTER TABLE company_listings ADD COLUMN product_code TEXT")
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS company_listings_product_code_idx ON company_listings(product_code)")
  for (const agent of Object.values(AGENTS)) {
    db.prepare("INSERT OR IGNORE INTO company_agents(id,name,role,active_instruction_version,model,tools_json) VALUES(?,?,?,?,?,?)").run(agent.id, agent.name, agent.role, agent.version, agent.defaultModel, JSON.stringify(agent.tools))
    db.prepare("INSERT OR IGNORE INTO company_agent_instructions(agent_id,version,instructions,created_at) VALUES(?,?,?,?)").run(agent.id, agent.version, agent.instructions, new Date().toISOString())
    db.prepare("UPDATE company_agents SET active_instruction_version=? WHERE id=? AND active_instruction_version<?").run(agent.version, agent.id, agent.version)
    db.prepare("UPDATE company_agents SET model=? WHERE id=?").run(modelFor(agent.id), agent.id)
  }
  // Upgrade the original Researcher contract without replacing other stored permissions.
  db.prepare("UPDATE company_agents SET tools_json=? WHERE id='market_researcher' AND tools_json=?")
    .run(JSON.stringify(AGENTS.market_researcher.tools), JSON.stringify(["web_search"]))
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
