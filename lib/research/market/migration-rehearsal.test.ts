import fs from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"
import { describe, expect, it } from "vitest"
import { openAutomationDatabase } from "../../automation/db/database"
import { AUTOMATION_SCHEMA_VERSION } from "../../automation/db/migrations"
import { researchSchemaGate } from "../schemaGate"

describe("local backup migration rehearsal", () => {
  it.skipIf(!process.env.MARKET_RESEARCH_BACKUP_PATH)("migrates a disposable copy without changing existing rows", () => {
    const backup = process.env.MARKET_RESEARCH_BACKUP_PATH!
    const folder = path.dirname(backup)
    const rehearsalFolder = fs.mkdtempSync(path.join(folder, "research-rehearsal-"))
    const rehearsal = path.join(rehearsalFolder, "copy.sqlite")
    expect(fs.existsSync(backup)).toBe(true)
    try {
      fs.copyFileSync(backup, rehearsal, fs.constants.COPYFILE_EXCL)
      const before = new Database(backup, { readonly: true, fileMustExist: true })
      const prior = before.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>
      const counts = Object.fromEntries(prior.map(({ name }) => [name,
        (before.prepare(`SELECT COUNT(*) AS total FROM "${name.replaceAll('"', '""')}"`).get() as { total: number }).total]))
      before.close()
      const migrated = openAutomationDatabase(rehearsal)
      try {
        expect(migrated.pragma("integrity_check", { simple: true })).toBe("ok")
        expect(migrated.pragma("user_version", { simple: true })).toBe(AUTOMATION_SCHEMA_VERSION)
        for (const [name, count] of Object.entries(counts)) {
          expect((migrated.prepare(`SELECT COUNT(*) AS total FROM "${name.replaceAll('"', '""')}"`).get() as { total: number }).total)
            .toBe(count)
        }
      } finally { migrated.close() }
    } finally {
      if (!path.resolve(rehearsalFolder).startsWith(path.resolve(folder) + path.sep)) throw new Error("Unsafe rehearsal directory")
      fs.rmSync(rehearsalFolder, { recursive: true, force: true })
    }
  })

  it.skipIf(!process.env.MARKET_RESEARCH_BACKUP_PATH)("does not migrate a v3 database when Research is opened", () => {
    const backup = process.env.MARKET_RESEARCH_BACKUP_PATH!
    const prior = process.env.AUTOMATION_DB_PATH
    process.env.AUTOMATION_DB_PATH = backup
    try {
      expect(researchSchemaGate()?.status).toBe(409)
      const database = new Database(backup, { readonly: true, fileMustExist: true })
      expect(database.pragma("user_version", { simple: true })).toBe(3)
      database.close()
    } finally {
      if (prior === undefined) delete process.env.AUTOMATION_DB_PATH
      else process.env.AUTOMATION_DB_PATH = prior
    }
  })
})
