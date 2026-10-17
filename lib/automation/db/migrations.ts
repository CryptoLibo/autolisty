import type Database from "better-sqlite3"

const MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE automation_jobs (
        id TEXT PRIMARY KEY,
        product_code TEXT NOT NULL UNIQUE,
        product_type TEXT NOT NULL,
        source_prompt TEXT NOT NULL,
        status TEXT NOT NULL,
        resume_status TEXT,
        local_agent_id TEXT,
        lease_expires_at TEXT,
        etsy_draft_id TEXT,
        etsy_state TEXT,
        etsy_url TEXT,
        seo_json TEXT,
        pinterest_seo_json TEXT,
        last_error TEXT,
        next_attempt_at TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE INDEX automation_jobs_status_idx
        ON automation_jobs(status, next_attempt_at, created_at);

      CREATE INDEX automation_jobs_agent_idx
        ON automation_jobs(local_agent_id, lease_expires_at);

      CREATE TABLE automation_job_steps (
        job_id TEXT NOT NULL,
        step_key TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        attempts INTEGER NOT NULL DEFAULT 0,
        started_at TEXT,
        completed_at TEXT,
        last_error TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (job_id, step_key),
        FOREIGN KEY (job_id) REFERENCES automation_jobs(id) ON DELETE CASCADE
      );

      CREATE TABLE automation_job_files (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        slot_key TEXT NOT NULL,
        role TEXT NOT NULL,
        position INTEGER,
        relative_path TEXT NOT NULL,
        r2_key TEXT,
        content_type TEXT,
        byte_size INTEGER,
        sha256 TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING',
        uploaded_at TEXT,
        verified_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (job_id, slot_key),
        FOREIGN KEY (job_id) REFERENCES automation_jobs(id) ON DELETE CASCADE
      );

      CREATE INDEX automation_job_files_status_idx
        ON automation_job_files(job_id, status);

      CREATE TABLE automation_job_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT,
        message TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (job_id) REFERENCES automation_jobs(id) ON DELETE CASCADE
      );

      CREATE INDEX automation_job_events_job_idx
        ON automation_job_events(job_id, id);

      CREATE TABLE automation_agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'OFFLINE',
        capabilities_json TEXT,
        current_job_id TEXT,
        last_seen_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (current_job_id) REFERENCES automation_jobs(id) ON DELETE SET NULL
      );

      CREATE TABLE etsy_draft_pool (
        draft_id TEXT PRIMARY KEY,
        product_type TEXT NOT NULL,
        taxonomy_id INTEGER,
        status TEXT NOT NULL DEFAULT 'AVAILABLE',
        assigned_job_id TEXT UNIQUE,
        assigned_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (assigned_job_id) REFERENCES automation_jobs(id) ON DELETE SET NULL
      );

      CREATE INDEX etsy_draft_pool_available_idx
        ON etsy_draft_pool(product_type, status, created_at);

      CREATE TABLE automation_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    sql: `
      ALTER TABLE automation_job_files ADD COLUMN deleted_at TEXT;

      CREATE INDEX automation_job_files_temporary_idx
        ON automation_job_files(role, status, created_at);
    `,
  },
] as const

export function runAutomationMigrations(database: Database.Database) {
  const currentVersion = Number(database.pragma("user_version", { simple: true }))

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) continue

    database.transaction(() => {
      database.exec(migration.sql)
      database.pragma(`user_version = ${migration.version}`)
    })()
  }

  return Number(database.pragma("user_version", { simple: true }))
}

export const AUTOMATION_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version
