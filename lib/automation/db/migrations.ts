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
  {
    version: 3,
    sql: `
      ALTER TABLE automation_jobs ADD COLUMN company_listing_id TEXT;
      CREATE UNIQUE INDEX automation_jobs_company_listing_idx ON automation_jobs(company_listing_id);
    `,
  },
  {
    version: 4,
    sql: `
      CREATE TABLE research_investigations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('open', 'directed')),
        query TEXT NOT NULL DEFAULT '',
        suggested_product_type TEXT,
        parameters_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'DRAFT',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX research_investigations_created_idx ON research_investigations(created_at DESC);

      CREATE TABLE research_sources (
        id TEXT PRIMARY KEY,
        investigation_id TEXT NOT NULL REFERENCES research_investigations(id),
        provider TEXT NOT NULL,
        source_url TEXT NOT NULL,
        queried_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE TABLE research_evidence (
        id TEXT PRIMARY KEY,
        investigation_id TEXT NOT NULL REFERENCES research_investigations(id),
        source_id TEXT REFERENCES research_sources(id),
        record_id TEXT,
        kind TEXT NOT NULL CHECK (kind IN ('observed', 'provider_estimate', 'ai_inference')),
        value_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX research_evidence_investigation_idx ON research_evidence(investigation_id);
      CREATE TABLE research_opportunities (
        id TEXT PRIMARY KEY,
        investigation_id TEXT NOT NULL REFERENCES research_investigations(id),
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'CANDIDATE',
        rationale TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE research_briefs (
        id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        investigation_id TEXT REFERENCES research_investigations(id),
        opportunity_id TEXT REFERENCES research_opportunities(id),
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (id, revision)
      );
      CREATE TABLE creative_prompts (
        id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        brief_id TEXT,
        brief_revision INTEGER,
        creative_text TEXT NOT NULL,
        origin TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (id, revision),
        FOREIGN KEY (brief_id, brief_revision) REFERENCES research_briefs(id, revision)
      );
      CREATE TABLE creative_projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        investigation_id TEXT REFERENCES research_investigations(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE creative_collections (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES creative_projects(id),
        title TEXT NOT NULL,
        identity_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE TABLE creative_designs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES creative_projects(id),
        collection_id TEXT REFERENCES creative_collections(id),
        prompt_id TEXT,
        prompt_revision INTEGER,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        created_at TEXT NOT NULL,
        FOREIGN KEY (prompt_id, prompt_revision) REFERENCES creative_prompts(id, revision)
      );
      CREATE TABLE creative_prompt_products (
        prompt_id TEXT NOT NULL,
        prompt_revision INTEGER NOT NULL,
        product_type TEXT NOT NULL,
        PRIMARY KEY (prompt_id, prompt_revision, product_type),
        FOREIGN KEY (prompt_id, prompt_revision) REFERENCES creative_prompts(id, revision)
      );
      CREATE TABLE creative_generation_configs (
        id TEXT PRIMARY KEY,
        design_id TEXT NOT NULL REFERENCES creative_designs(id),
        product_type TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT,
        aspect_ratio TEXT,
        settings_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE TABLE creative_generated_images (
        id TEXT PRIMARY KEY,
        design_id TEXT NOT NULL REFERENCES creative_designs(id),
        config_id TEXT NOT NULL REFERENCES creative_generation_configs(id),
        provider_generation_id TEXT,
        image_ref TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE creative_reviews (
        id TEXT PRIMARY KEY,
        design_id TEXT NOT NULL REFERENCES creative_designs(id),
        image_id TEXT REFERENCES creative_generated_images(id),
        decision TEXT NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED')),
        comment TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE creative_learning_rules (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        rule_json TEXT NOT NULL,
        source_review_id TEXT REFERENCES creative_reviews(id),
        status TEXT NOT NULL DEFAULT 'PROPOSED',
        created_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 5,
    sql: `
      CREATE TABLE creative_concepts (
        id TEXT PRIMARY KEY,
        investigation_id TEXT REFERENCES research_investigations(id),
        opportunity_id TEXT REFERENCES research_opportunities(id),
        title TEXT NOT NULL,
        niche_key TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX creative_concepts_investigation_idx ON creative_concepts(investigation_id, created_at);
      CREATE INDEX creative_concepts_opportunity_idx ON creative_concepts(opportunity_id, created_at);
      ALTER TABLE creative_prompts ADD COLUMN concept_id TEXT REFERENCES creative_concepts(id);
      CREATE INDEX creative_prompts_concept_idx ON creative_prompts(concept_id, id, revision);
      ALTER TABLE creative_designs ADD COLUMN concept_id TEXT REFERENCES creative_concepts(id);

      CREATE TABLE creative_generation_jobs (
        id TEXT PRIMARY KEY,
        design_id TEXT NOT NULL REFERENCES creative_designs(id),
        concept_id TEXT NOT NULL REFERENCES creative_concepts(id),
        prompt_id TEXT NOT NULL,
        prompt_revision INTEGER NOT NULL,
        config_id TEXT NOT NULL REFERENCES creative_generation_configs(id),
        status TEXT NOT NULL DEFAULT 'PENDING',
        provider_job_id TEXT,
        idempotency_key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (prompt_id, prompt_revision) REFERENCES creative_prompts(id, revision)
      );
      CREATE INDEX creative_generation_jobs_design_idx ON creative_generation_jobs(design_id, created_at);
      CREATE TABLE creative_production_links (
        generation_job_id TEXT PRIMARY KEY REFERENCES creative_generation_jobs(id),
        automation_job_id TEXT NOT NULL UNIQUE REFERENCES automation_jobs(id),
        created_at TEXT NOT NULL
      );

      CREATE TABLE creative_corrections (
        id TEXT PRIMARY KEY,
        original_text TEXT NOT NULL,
        instruction TEXT NOT NULL,
        structured_json TEXT NOT NULL,
        scope TEXT NOT NULL CHECK (scope IN ('general','product','niche','design')),
        scope_key TEXT NOT NULL DEFAULT '',
        conflict_key TEXT NOT NULL,
        polarity INTEGER NOT NULL DEFAULT 0 CHECK (polarity IN (-1,0,1)),
        priority INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK (status IN ('PROPOSED','ACTIVE','INACTIVE','CONFLICT')),
        version INTEGER NOT NULL DEFAULT 1,
        fingerprint TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX creative_corrections_lookup_idx ON creative_corrections(status, scope, scope_key, priority DESC);
      CREATE INDEX creative_corrections_conflict_idx ON creative_corrections(conflict_key, status);
      CREATE TABLE creative_correction_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        correction_id TEXT NOT NULL REFERENCES creative_corrections(id),
        version INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (correction_id, version)
      );
      CREATE TABLE creative_rule_uses (
        run_id TEXT NOT NULL,
        correction_id TEXT NOT NULL REFERENCES creative_corrections(id),
        correction_version INTEGER NOT NULL,
        used_at TEXT NOT NULL,
        PRIMARY KEY (run_id, correction_id)
      );
    `,
  },
  {
    version: 6,
    sql: `
      CREATE TABLE creative_prompt_runs (
        id TEXT PRIMARY KEY,
        input_hash TEXT NOT NULL UNIQUE,
        input_json TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('variations','independent','legacy')),
        investigation_id TEXT REFERENCES research_investigations(id),
        opportunity_id TEXT REFERENCES research_opportunities(id),
        concept_id TEXT REFERENCES creative_concepts(id),
        model TEXT NOT NULL,
        instruction_version TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX creative_prompt_runs_investigation_idx ON creative_prompt_runs(investigation_id, created_at DESC);
      CREATE INDEX creative_prompt_runs_concept_idx ON creative_prompt_runs(concept_id, created_at DESC);
      CREATE TABLE creative_prompt_run_versions (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES creative_prompt_runs(id),
        version INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('IN_PROGRESS','COMPLETED','FAILED')),
        prompts_json TEXT,
        evaluation_json TEXT,
        attempts_json TEXT NOT NULL DEFAULT '[]',
        usage_json TEXT,
        estimated_cost_usd REAL,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (run_id, version)
      );
      CREATE INDEX creative_prompt_run_versions_run_idx ON creative_prompt_run_versions(run_id, version DESC);
      CREATE TABLE creative_prompt_selections (
        version_id TEXT NOT NULL REFERENCES creative_prompt_run_versions(id),
        prompt_index INTEGER NOT NULL CHECK (prompt_index BETWEEN 0 AND 3),
        selected_at TEXT NOT NULL,
        PRIMARY KEY (version_id, prompt_index)
      );
      CREATE TABLE creative_prompt_run_concepts (
        version_id TEXT NOT NULL REFERENCES creative_prompt_run_versions(id),
        prompt_index INTEGER NOT NULL CHECK (prompt_index BETWEEN 0 AND 3),
        concept_id TEXT NOT NULL REFERENCES creative_concepts(id),
        prompt_id TEXT NOT NULL,
        prompt_revision INTEGER NOT NULL,
        PRIMARY KEY (version_id, prompt_index),
        FOREIGN KEY (prompt_id, prompt_revision) REFERENCES creative_prompts(id, revision)
      );
    `,
  },
  {
    version: 7,
    sql: `
      CREATE TABLE research_runs (
        id TEXT PRIMARY KEY,
        investigation_id TEXT NOT NULL REFERENCES research_investigations(id),
        request_hash TEXT NOT NULL,
        plan_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('PENDING','RUNNING','COMPLETED','PARTIAL','INSUFFICIENT','FAILED')),
        coverage_json TEXT NOT NULL DEFAULT '{}',
        usage_json TEXT NOT NULL DEFAULT '{}',
        error TEXT,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (investigation_id, request_hash)
      );
      CREATE INDEX research_runs_investigation_idx ON research_runs(investigation_id, started_at DESC);
      CREATE TABLE research_queries (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES research_runs(id),
        provider TEXT NOT NULL,
        capability TEXT NOT NULL,
        query_hash TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('COMPLETED','FAILED','SKIPPED')),
        credits_estimated INTEGER,
        credits_reported INTEGER,
        error TEXT,
        captured_at TEXT NOT NULL
      );
      CREATE INDEX research_queries_run_idx ON research_queries(run_id);
      ALTER TABLE research_evidence ADD COLUMN metric TEXT;
      ALTER TABLE research_evidence ADD COLUMN unit TEXT;
      ALTER TABLE research_evidence ADD COLUMN numeric_value REAL;
      ALTER TABLE research_evidence ADD COLUMN period TEXT;
      ALTER TABLE research_evidence ADD COLUMN captured_at TEXT;
      ALTER TABLE research_evidence ADD COLUMN expires_at TEXT;
      ALTER TABLE research_evidence ADD COLUMN uncertainty TEXT;
      CREATE INDEX research_evidence_expiry_idx ON research_evidence(expires_at);
      CREATE TABLE research_opportunity_evidence (
        opportunity_id TEXT NOT NULL REFERENCES research_opportunities(id),
        evidence_id TEXT NOT NULL REFERENCES research_evidence(id),
        PRIMARY KEY (opportunity_id, evidence_id)
      );
      CREATE TABLE research_opportunity_selections (
        opportunity_id TEXT PRIMARY KEY REFERENCES research_opportunities(id),
        selected_at TEXT NOT NULL
      );
      CREATE TABLE research_query_cache (
        query_hash TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        result_json TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 8,
    sql: `
      ALTER TABLE research_runs ADD COLUMN lease_owner TEXT;
      ALTER TABLE research_runs ADD COLUMN lease_expires_at TEXT;
      ALTER TABLE research_runs ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE research_runs ADD COLUMN recovery_state TEXT NOT NULL DEFAULT 'READY'
        CHECK (recovery_state IN ('READY','NEEDS_REVIEW','CANCEL_REQUESTED','CANCELLED'));
      ALTER TABLE research_runs ADD COLUMN cancelled_at TEXT;
      ALTER TABLE research_runs ADD COLUMN last_recovery_at TEXT;
      CREATE INDEX research_runs_recovery_idx ON research_runs(status,recovery_state,lease_expires_at);
      CREATE TABLE research_call_ledger (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES research_runs(id),
        provider TEXT NOT NULL,
        capability TEXT NOT NULL,
        query_hash TEXT NOT NULL,
        query_json TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('PREPARED','IN_FLIGHT','COMPLETED','UNKNOWN','FAILED')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (run_id,query_hash)
      );
      CREATE INDEX research_call_ledger_run_idx ON research_call_ledger(run_id,state);
      CREATE TABLE research_call_evidence (
        call_id TEXT NOT NULL REFERENCES research_call_ledger(id),
        evidence_id TEXT NOT NULL REFERENCES research_evidence(id),
        PRIMARY KEY (call_id,evidence_id)
      );
      ALTER TABLE research_opportunities ADD COLUMN origin_provider TEXT;
      ALTER TABLE research_opportunities ADD COLUMN retention_expires_at TEXT;
      CREATE TABLE research_maintenance_log (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL CHECK (status IN ('RUNNING','COMPLETED','FAILED')),
        counts_json TEXT,
        error TEXT
      );
    `,
  },
  {
    version: 9,
    sql: `
      ALTER TABLE research_maintenance_log ADD COLUMN origin TEXT NOT NULL DEFAULT 'inline';
      ALTER TABLE research_call_ledger ADD COLUMN reserved_credits INTEGER NOT NULL DEFAULT 0;
      CREATE TABLE research_alura_budget (
        month TEXT PRIMARY KEY,
        spent_credits INTEGER NOT NULL DEFAULT 0,
        reserved_credits INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE research_alura_diagnostics (
        id TEXT PRIMARY KEY,
        checked_at TEXT NOT NULL,
        state TEXT NOT NULL,
        http_status INTEGER,
        latency_ms INTEGER,
        plan TEXT,
        credits_remaining INTEGER,
        credits_cost INTEGER,
        rate_limit INTEGER,
        error_code TEXT
      );
      CREATE INDEX research_alura_diagnostics_recent_idx ON research_alura_diagnostics(checked_at DESC);
    `,
  },
  {
    version: 10,
    sql: `
      CREATE TABLE research_knowledge (
        id TEXT PRIMARY KEY,
        investigation_id TEXT NOT NULL REFERENCES research_investigations(id),
        opportunity_id TEXT REFERENCES research_opportunities(id),
        kind TEXT NOT NULL CHECK (kind IN ('conclusion','hypothesis','decision','brief','concept','prompt','correction')),
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        author TEXT NOT NULL CHECK (author IN ('owner','system')),
        original_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (original_confirmed IN (0,1)),
        expires_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE research_knowledge_provenance (
        knowledge_id TEXT NOT NULL REFERENCES research_knowledge(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        investigation_id TEXT NOT NULL,
        source_id TEXT,
        captured_at TEXT,
        PRIMARY KEY (knowledge_id,provider,source_id)
      );
      CREATE INDEX research_knowledge_expiry_idx ON research_knowledge(expires_at);
    `,
  },
] as const

export function runAutomationMigrations(database: Database.Database, upToVersion = AUTOMATION_SCHEMA_VERSION) {
  const currentVersion = Number(database.pragma("user_version", { simple: true }))

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion || migration.version > upToVersion) continue

    database.transaction(() => {
      database.exec(migration.sql)
      database.pragma(`user_version = ${migration.version}`)
    })()
  }

  return Number(database.pragma("user_version", { simple: true }))
}

export const AUTOMATION_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version
