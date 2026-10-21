import { afterEach, describe, expect, it } from "vitest"
import type Database from "better-sqlite3"
import { openAutomationDatabase } from "./db/database"
import { AutomationRepository } from "./repository"

describe("automation repository", () => {
  let database: Database.Database | null = null

  afterEach(() => {
    database?.close()
    database = null
  })

  it("creates a persistent job identity and audit event", () => {
    database = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(database)
    const job = repository.createJob({
      productType: "png_designs",
      sourcePrompt: "A production-ready Halloween nurse design.",
    })

    expect(job.productCode).toMatch(/^LBCreaStudio-[A-Z0-9]{6}$/)
    expect(job.status).toBe("CREATED")
    expect(repository.listJobEvents(job.id)).toHaveLength(1)
  })

  it("accepts a Company listing code without generating a replacement", () => {
    database = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(database)
    const input = { productType: "png_designs" as const, sourcePrompt: "Approved design", productCode: "LBCreaStudio-ABC123" }
    expect(repository.createJob(input).productCode).toBe(input.productCode)
    expect(() => repository.createJob(input)).toThrow(/already assigned/)
    expect(() => repository.createJob({ ...input, productCode: "invalid" })).toThrow(/Invalid product code/)
  })

  it("uses the Company listing ID as an idempotency key", () => {
    database = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(database)
    const input = {
      productType: "png_designs" as const, sourcePrompt: "Approved design",
      productCode: "LBCreaStudio-DEF456", companyListingId: "f4ea8109-99a4-4dfd-8433-33561c455623",
    }
    const first = repository.createJob(input)
    expect(repository.createJob(input).id).toBe(first.id)
    expect(repository.listJobs()).toHaveLength(1)
    expect(() => repository.createJob({ ...input, sourcePrompt: "Changed" })).toThrow(/different Automation job/)
  })

  it("records transitions atomically", () => {
    database = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(database)
    const job = repository.createJob({
      productType: "vertical_wall_art",
      sourcePrompt: "Botanical wall art in a restrained vintage style.",
    })

    const updated = repository.transitionJob(job.id, "SOURCE_READY")
    expect(updated.status).toBe("SOURCE_READY")
    expect(repository.listJobEvents(job.id)).toHaveLength(2)
  })

  it("retains the exact retry target", () => {
    database = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(database)
    const job = repository.createJob({
      productType: "frame_tv_art",
      sourcePrompt: "Minimal landscape for a Frame TV display.",
    })

    repository.transitionJob(job.id, "SOURCE_READY")
    const waiting = repository.transitionJob(job.id, "RETRY_WAIT", {
      error: "Temporary R2 failure",
      resumeStatus: "SOURCE_READY",
    })
    expect(waiting.resumeStatus).toBe("SOURCE_READY")
    expect(waiting.retryCount).toBe(1)

    const resumed = repository.transitionJob(job.id, "SOURCE_READY")
    expect(resumed.resumeStatus).toBeNull()
    expect(resumed.lastError).toBeNull()
  })

  it("rejects relative database paths", () => {
    expect(() => openAutomationDatabase("data/ambiguous.sqlite")).toThrow(
      "AUTOMATION_DB_PATH must be an absolute filesystem path."
    )
  })

  it("keeps one production job active and claims queued work oldest first", () => {
    database = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(database)
    const first = repository.createJob({
      productType: "png_designs",
      sourcePrompt: "First queued design.",
    })
    const second = repository.createJob({
      productType: "png_designs",
      sourcePrompt: "Second queued design.",
    })

    repository.transitionJob(first.id, "SOURCE_READY")
    repository.transitionJob(first.id, "QUEUED_LOCAL")
    repository.transitionJob(second.id, "SOURCE_READY")
    repository.transitionJob(second.id, "QUEUED_LOCAL")
    repository.resumePipeline()

    expect(repository.claimNextQueuedJob("old-pc")?.id).toBe(first.id)
    expect(repository.claimNextQueuedJob("old-pc")).toBeNull()
  })

  it("finishes the active listing before completing a pause request", () => {
    database = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(database)
    const job = repository.createJob({
      productType: "vertical_wall_art",
      sourcePrompt: "A complete wall art production job.",
    })

    repository.transitionJob(job.id, "SOURCE_READY")
    repository.transitionJob(job.id, "QUEUED_LOCAL")
    repository.resumePipeline()
    repository.claimNextQueuedJob("old-pc")
    expect(repository.requestPipelinePause()).toBe("STOPPING_AFTER_CURRENT")

    const path = [
      "LOCAL_BUILDING",
      "LOCAL_VALIDATING",
      "LOCAL_UPLOADING",
      "LOCAL_COMPLETE",
      "DRAFT_ASSIGNED",
      "SEO_GENERATING",
      "SEO_READY",
      "PINTEREST_SEO_GENERATING",
      "PINTEREST_SEO_READY",
      "DELIVERY_PREPARING",
      "DELIVERY_READY",
      "ETSY_TEXT_SYNCING",
      "ETSY_MEDIA_SYNCING",
      "ETSY_FILE_SYNCING",
      "WAITING_ETSY_REVIEW",
    ] as const
    for (const status of path) repository.transitionJob(job.id, status)

    expect(repository.getPipelineMode()).toBe("PAUSED")
  })

  it("tracks and clears temporary source storage without deleting the job", () => {
    database = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(database)
    const job = repository.createJob({
      productType: "png_designs",
      sourcePrompt: "Temporary source lifecycle.",
    })

    repository.registerTemporarySource(job.id, {
      relativePath: "Source/Design.png",
      r2Key: `production-staging/${job.productCode}/Design.png`,
      contentType: "image/png",
      byteSize: 1024,
      sha256: "a".repeat(64),
    })
    repository.verifyTemporarySource(job.id)
    repository.markTemporarySourceDeleted(job.id)

    const source = repository.listJobFiles(job.id)[0]
    expect(source.status).toBe("DELETED")
    expect(source.r2Key).toBeNull()
    expect(source.deletedAt).toBeTruthy()
    expect(repository.getJob(job.id)?.productCode).toBe(job.productCode)
  })

  it("registers and verifies resumable production output slots", () => {
    database = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(database)
    const job = repository.createJob({
      productType: "png_designs",
      sourcePrompt: "Verified production output.",
    })

    repository.registerOutputUpload(job.id, {
      slotKey: "listing:1",
      role: "LISTING_MEDIA",
      position: 1,
      relativePath: "1.jpg",
      r2Key: `mockups/${job.productCode}/1.jpg`,
      contentType: "image/jpeg",
      byteSize: 2048,
      sha256: "b".repeat(64),
    })
    expect(repository.listJobFiles(job.id)[0].status).toBe("UPLOADING")

    const verified = repository.verifyOutputUpload(job.id, "listing:1")
    expect(verified.status).toBe("VERIFIED")
    expect(verified.verifiedAt).toBeTruthy()
  })

  it("stores unique Etsy drafts by product without replacing existing ownership", () => {
    database = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(database)

    expect(repository.addDrafts("png_designs", ["1001", "1002", "1001"])).toEqual({
      added: 2,
      duplicates: 0,
      totalSubmitted: 2,
    })
    expect(repository.addDrafts("vertical_wall_art", ["1002", "1003"])).toEqual({
      added: 1,
      duplicates: 1,
      totalSubmitted: 2,
    })

    expect(repository.listDrafts().map((draft) => draft.draftId)).toEqual([
      "1001",
      "1002",
      "1003",
    ])
    expect(repository.listDrafts().find((draft) => draft.draftId === "1002")?.productType)
      .toBe("png_designs")
    expect(repository.getDraftPoolSummary()).toEqual([
      { productType: "png_designs", status: "AVAILABLE", count: 2 },
      { productType: "vertical_wall_art", status: "AVAILABLE", count: 1 },
    ])
  })

  it("removes only available Etsy drafts", () => {
    database = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(database)
    repository.addDrafts("frame_tv_art", ["2001"])

    expect(repository.removeAvailableDraft("2001")).toBe(true)
    expect(repository.removeAvailableDraft("2001")).toBe(false)
    expect(repository.listDrafts()).toHaveLength(0)
  })

  it("tracks the local agent and its claimed job", () => {
    database = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(database)
    const job = repository.createJob({
      productType: "png_designs",
      sourcePrompt: "A queued design for the production agent.",
    })
    repository.transitionJob(job.id, "SOURCE_READY")
    repository.transitionJob(job.id, "QUEUED_LOCAL")
    repository.resumePipeline()
    repository.touchAgent({
      id: "old-production-pc",
      name: "Old production PC",
      capabilities: { photoshop: "2026" },
    })

    const claimed = repository.claimNextQueuedJob("old-production-pc")
    expect(claimed?.id).toBe(job.id)
    expect(repository.getAgent("old-production-pc")?.currentJobId).toBe(job.id)
    expect(repository.getAgent("old-production-pc")?.status).toBe("BUSY")

    repository.setAgentCurrentJob("old-production-pc", null)
    expect(repository.getAgent("old-production-pc")?.status).toBe("ONLINE")
  })
})
