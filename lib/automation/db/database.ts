import fs from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"
import { runAutomationMigrations } from "./migrations"

const DEFAULT_DATABASE_PATH = path.join(
  process.cwd(),
  "data",
  "autolisty-automation.sqlite"
)

type AutomationDatabaseGlobal = typeof globalThis & {
  __autolistyAutomationDatabase?: Database.Database
  __autolistyAutomationDatabasePath?: string
}

function resolveDatabasePath(databasePath?: string) {
  const configuredPath = databasePath || process.env.AUTOMATION_DB_PATH

  if (!configuredPath) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTOMATION_DB_PATH is required in production.")
    }

    return DEFAULT_DATABASE_PATH
  }
  if (configuredPath === ":memory:") return configuredPath
  if (!path.isAbsolute(configuredPath)) {
    throw new Error("AUTOMATION_DB_PATH must be an absolute filesystem path.")
  }

  return configuredPath
}

export function openAutomationDatabase(databasePath?: string) {
  const resolvedPath = resolveDatabasePath(databasePath)

  if (resolvedPath !== ":memory:") {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true })
  }

  const database = new Database(resolvedPath)
  database.pragma("foreign_keys = ON")
  database.pragma("busy_timeout = 5000")
  database.pragma("journal_mode = WAL")
  database.pragma("synchronous = FULL")
  runAutomationMigrations(database)
  return database
}

export function getAutomationDatabase() {
  const globalDatabase = globalThis as AutomationDatabaseGlobal
  const resolvedPath = resolveDatabasePath()

  if (
    !globalDatabase.__autolistyAutomationDatabase ||
    globalDatabase.__autolistyAutomationDatabasePath !== resolvedPath
  ) {
    globalDatabase.__autolistyAutomationDatabase?.close()
    globalDatabase.__autolistyAutomationDatabase = openAutomationDatabase(resolvedPath)
    globalDatabase.__autolistyAutomationDatabasePath = resolvedPath
  }

  return globalDatabase.__autolistyAutomationDatabase
}
