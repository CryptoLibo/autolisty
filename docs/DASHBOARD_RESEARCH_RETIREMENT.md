# Dashboard rollout and Research retirement

Market Research Studio routes, UI, connectors, credit controls and retention worker have been removed. Prompt Lab's original reference-analysis workflow (`/api/prompt-lab`) remains independent and available from the workspace menu. Automation, Listing, Scale and Image Lab are unchanged.

## Existing Automation database

Keep `AUTOMATION_DB_PATH` and the existing SQLite file. Migration history v1-v10 is intentionally retained: deployed databases already have these versions, and fresh databases must be able to reach the same schema. Research and creative tables introduced in v4-v10 are dormant after this release. They are **not** dropped automatically during deployment, because that would irreversibly remove research history and could invalidate existing foreign keys. A future, separately authorized archival migration may remove those tables after a verified SQLite backup and a dependency check. Never delete or recreate the entire Automation database.

## Hetzner after deploying this commit

1. Back up `/var/lib/autolisty/automation.sqlite` before deployment. For example, as the database owner: `sqlite3 /var/lib/autolisty/automation.sqlite ".backup '/var/lib/autolisty/automation-before-dashboard.sqlite'"` then `sqlite3 /var/lib/autolisty/automation-before-dashboard.sqlite 'PRAGMA integrity_check;'`. Require `ok`. Keep the backup outside the Git checkout.
2. Run the existing `./deploy.sh` and verify the application plus `/api/automation/health` as the signed-in owner. Confirm Dashboard loads, Automation jobs remain visible, Prompt Lab works, and Listing/Scale/Image Lab still open.
3. The old `autolisty-research-maintenance` systemd unit points to a removed script. After verifying the new deployment, inspect it with `sudo systemctl cat autolisty-research-maintenance.service`. If it is the retired Research worker, run `sudo systemctl disable --now autolisty-research-maintenance.service`. Leave its unit file on disk for rollback until a later cleanup; do not use `systemctl mask` or stop other services. This does not affect Automation's database or app process.
4. Remove only Market Research-specific environment entries from the private server environment: `ALURA_API_KEY`, `MARKET_RESEARCH_LIVE_ENABLED`, `MARKET_RESEARCH_FULL_RUN_ENABLED`, `MARKET_RESEARCH_TRIAL_ENABLED`, `MARKET_RESEARCH_MAX_AI_TOKENS`, and any EverBee values used only for this module. Do not remove shared Etsy, Pinterest, R2, OpenAI, auth or `AUTOMATION_DB_PATH` values.
5. Do not delete the database, backups or old research data in this rollout. Rollback is the previous Git commit plus the retained database and service unit; do not run a destructive down-migration.

No provider API calls or live publications are needed for these checks. Dashboard currently displays only Automation job counts from the existing authenticated health route. Commercial and financial metrics remain explicitly unconnected.
