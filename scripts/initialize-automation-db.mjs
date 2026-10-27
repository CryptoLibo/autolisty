import fs from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"
import { AUTOMATION_SCHEMA_VERSION, runAutomationMigrations } from "../lib/automation/db/migrations.ts"

const target = process.env.AUTOMATION_DB_PATH
if (process.argv[2] !== "--create" || !target || !path.isAbsolute(target)) {
  throw new Error("Use --create with an absolute AUTOMATION_DB_PATH.")
}
const parent = path.dirname(target)
if (!fs.existsSync(parent)) throw new Error("Database directory does not exist.")
if (fs.existsSync(target)) throw new Error("Database already exists; inspect and back it up before migration.")

// Exclusive creation prevents accidentally replacing a database discovered after preflight.
const descriptor = fs.openSync(target, "wx", 0o600)
fs.closeSync(descriptor)
const db = new Database(target, { fileMustExist: true })
try {
  db.pragma("foreign_keys = ON")
  db.pragma("busy_timeout = 5000")
  db.pragma("journal_mode = WAL")
  db.pragma("synchronous = FULL")
  const version = runAutomationMigrations(db)
  const integrity = db.pragma("integrity_check", { simple: true })
  if (version !== AUTOMATION_SCHEMA_VERSION || integrity !== "ok") {
    throw new Error("Database initialization did not pass integrity checks.")
  }
  process.stdout.write(JSON.stringify({ path: target, version, integrity }) + "\n")
} finally { db.close() }
