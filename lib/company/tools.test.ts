import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { openAutomationDatabase, openAutomationReadDatabase } from "../automation/db/database"
import { AutomationRepository } from "../automation/repository"
import { executeJamesTool, formatJobsResult } from "./tools"

describe("James read-only get_jobs tool", () => {
  const previousPath = process.env.AUTOMATION_DB_PATH
  const directories: string[] = []

  afterEach(() => {
    if (previousPath === undefined) delete process.env.AUTOMATION_DB_PATH
    else process.env.AUTOMATION_DB_PATH = previousPath
    for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
  })

  function databasePath() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "james-jobs-test-"))
    directories.push(directory)
    return path.join(directory, "automation.sqlite")
  }

  it("reads real job state without changing job, event or file counts", () => {
    const file = databasePath()
    process.env.AUTOMATION_DB_PATH = file
    const db = openAutomationDatabase(file)
    const repository = new AutomationRepository(db)
    const job = repository.createJob({ productType: "vertical_wall_art", sourcePrompt: "Approved art" })
    repository.transitionJob(job.id, "SOURCE_READY")
    const before = { jobs: repository.listJobs(), events: repository.listJobEvents(job.id), files: repository.listJobFiles(job.id) }
    db.close()

    const result = executeJamesTool({ name: "get_jobs", limit: 5 }, "owner_web")
    expect(result).toMatchObject({ available: true, pipelineMode: "PAUSED", jobs: [{ id: job.id, productCode: job.productCode, status: "SOURCE_READY" }] })
    expect(formatJobsResult(result)).toContain(job.productCode)
    const check = openAutomationReadDatabase(file)
    try {
      const unchanged = new AutomationRepository(check)
      expect(unchanged.listJobs()).toEqual(before.jobs)
      expect(unchanged.listJobEvents(job.id)).toEqual(before.events)
      expect(unchanged.listJobFiles(job.id)).toEqual(before.files)
    } finally { check.close() }
  })

  it("does not create a missing database or reveal its path", () => {
    const file = databasePath()
    process.env.AUTOMATION_DB_PATH = file
    const result = executeJamesTool({ name: "get_jobs" }, "allowed_telegram")
    expect(result).toEqual({ available: false })
    expect(fs.existsSync(file)).toBe(false)
    expect(formatJobsResult(result)).not.toContain(file)
  })

  it("rejects untrusted access and unbounded queries", () => {
    expect(() => executeJamesTool({ name: "get_jobs" }, "untrusted" as "owner_web")).toThrow("James tool access denied.")
    expect(() => executeJamesTool({ name: "get_jobs", limit: 11 }, "owner_web")).toThrow("Invalid job query limit.")
    expect(() => executeJamesTool({ name: "delete_jobs" } as never, "owner_web")).toThrow("James tool is not permitted.")
  })
})
