import { afterEach, describe, expect, it, vi } from "vitest"
import type Database from "better-sqlite3"
import { openAutomationDatabase } from "./db/database"
import { AutomationRepository } from "./repository"
import { classifyAutomationOutput } from "./outputFiles"
import { advanceJob, keywordResearchFromBrief, notificationFor, runPostProductionTick, type PostProductionDeps } from "./postProduction"
import type { AutomationJobStatus } from "./types"

const LOCAL_PATH: AutomationJobStatus[] = [
  "SOURCE_READY", "QUEUED_LOCAL", "LOCAL_CLAIMED", "LOCAL_BUILDING",
  "LOCAL_VALIDATING", "LOCAL_UPLOADING", "LOCAL_COMPLETE",
]

function frameTvJob(repository: AutomationRepository, { video = true } = {}) {
  const job = repository.createJob({
    productType: "frame_tv_art",
    sourcePrompt: "Quiet misty lake at dawn",
    briefJson: JSON.stringify({
      primaryKeyword: { keyword: "frame tv art lake", etsyMonthlySearches: 1200, competition: "low" },
      secondaryKeywords: [{ keyword: "misty landscape art" }],
    }),
  })
  const paths = [
    ...[1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((slot) => `${slot}.jpg`),
    ...(video ? ["2.mp4"] : []),
    "Pines/pin-1.jpg", "Pines/pin-2.jpg", "Pines/pin-3.jpg",
    "Diseños Finales/FrameTVArt.jpg", "Diseños Finales/Quick Setup Guide.pdf",
  ]
  for (const status of LOCAL_PATH.slice(0, 6)) repository.transitionJob(job.id, status)
  for (const relativePath of paths) {
    const classified = classifyAutomationOutput({ productType: "frame_tv_art", productCode: job.productCode, relativePath })
    repository.registerOutputUpload(job.id, { ...classified, contentType: "image/jpeg", byteSize: 10, sha256: "a".repeat(64) })
    repository.verifyOutputUpload(job.id, classified.slotKey)
  }
  return repository.transitionJob(job.id, "LOCAL_COMPLETE")
}

function fakeDeps(repository: AutomationRepository, overrides: Partial<PostProductionDeps> = {}): PostProductionDeps {
  return {
    repository,
    getEtsyToken: async () => ({ access_token: "1.a", refresh_token: "r", expires_at: Date.now() + 3_600_000, token_type: "Bearer", user_id: "1", scope: [] }),
    getShopId: async () => 42,
    generateSeo: vi.fn(async (input: Parameters<PostProductionDeps["generateSeo"]>[0]) => ({
      title: "Misty Lake Frame TV Art",
      description_keywords_5: ["a", "b", "c", "d", "e"],
      description_final: `Description ${input.listingId}`,
      tags_13: ["frame tv art"],
      etsy_attributes: [{ propertyId: 1, displayName: "Primary color", valueIds: [2], values: ["Blue"], scaleId: null }],
      media: input.mockups.map((item: { id: string; position: number }) => ({ id: item.id, position: item.position, alt_text: `alt ${item.id}` })),
    })),
    buildDeliveryPdf: vi.fn(async (_type: string, code: string) => ({ url: `https://files.example/delivery-pdf/${code}.pdf` })),
    syncText: vi.fn(async () => {}),
    syncImages: vi.fn(async () => {}),
    syncFile: vi.fn(async () => {}),
    syncVideo: vi.fn(async () => {}),
    getListing: vi.fn(async () => ({ state: "draft" })),
    publicUrl: (key) => `https://files.example/${key}`,
    getPinterestToken: async () => ({ access_token: "p", refresh_token: "pr", expires_at: Date.now() + 3_600_000, scope: [], token_type: "bearer" }),
    generatePinCopy: vi.fn(async (input: { pins: Array<{ id: string }> }) => ({
      pins: input.pins.map((pin) => ({ id: pin.id, title: `Title ${pin.id}`, description: `Desc ${pin.id}` })),
    })),
    findBoard: vi.fn(async (_token: unknown, name: string) => (name === "Frame TV Art" ? { id: "77", name: "Frame TV Art" } : null)),
    publishPin: vi.fn(async (_token: unknown, input: { imageUrl: string }) => ({ pinId: `pin${input.imageUrl.slice(-5, -4)}`, boardId: "77" })),
    recordPin: vi.fn(),
    ...overrides,
  }
}

describe("post-production worker", () => {
  let database: Database.Database | null = null
  afterEach(() => {
    database?.close()
    database = null
  })

  it("lleva un listing de LOCAL_COMPLETE al draft de Etsy listo para revisar", async () => {
    database = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(database)
    repository.addDrafts("frame_tv_art", ["9001"])
    const job = frameTvJob(repository)
    const deps = fakeDeps(repository)

    const result = await advanceJob(job, deps)

    expect(result.status).toBe("WAITING_ETSY_REVIEW")
    expect(result.etsyDraftId).toBe("9001")
    expect(result.deliveryFilename).toBe(`${job.productCode}.pdf`)
    expect(result.nextAttemptAt).not.toBeNull()

    const seoInput = vi.mocked(deps.generateSeo).mock.calls[0][0]
    // Como en Scale: el archivo final real del diseño, no un mockup.
    expect(seoInput.designUrl).toBe(`https://files.example/deliverables/${job.productCode}/design.jpg`)
    expect(seoInput.keywordResearch).toContain('Primary keyword: "frame tv art lake"')
    expect(seoInput.listingId).toBe(job.productCode)

    // La vista previa (12) es la segunda foto en Etsy.
    const images = vi.mocked(deps.syncImages).mock.calls[0][1]
    expect(images.map((image) => image.url.split("/").pop())).toEqual([
      "mockup-1.jpg", "mockup-12.jpg", "mockup-3.jpg", "mockup-4.jpg", "mockup-5.jpg", "mockup-6.jpg",
      "mockup-7.jpg", "mockup-8.jpg", "mockup-9.jpg", "mockup-10.jpg", "mockup-11.jpg",
    ])
    expect(images.map((image) => image.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(images[1].altText).toBe("alt image-2")
    // Fotos fijas (5, 8, 11): texto fijo del producto, y no se mandan al SEO.
    expect(images[4].altText).toMatch(/^LBCreaStudio sale banner/)
    expect(images[7].altText).toMatch(/^Frame TV art details/)
    expect(images[10].altText).toMatch(/^Why choose LBCreaStudio/)
    expect(seoInput.mockups.map((item) => item.position)).toEqual([1, 2, 3, 4, 6, 7, 9, 10])
    expect(deps.syncVideo).toHaveBeenCalledWith(expect.anything(), {
      url: `https://files.example/mockups/${job.productCode}/mockup-2.mp4`,
      name: `${job.productCode}.mp4`,
    })
    expect(deps.syncFile).toHaveBeenCalledWith(expect.anything(), {
      url: `https://files.example/delivery-pdf/${job.productCode}.pdf`,
      filename: `${job.productCode}.pdf`,
    })
  })

  it("sin drafts espera (no es incidencia), avisa una vez y sigue al añadir drafts", async () => {
    database = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(database)
    const job = frameTvJob(repository)
    const notify = vi.fn(async () => {})
    const first = await advanceJob(job, fakeDeps(repository, { notify }))
    expect(first.status).toBe("LOCAL_COMPLETE")
    expect(first.lastError ?? null).toBeNull()
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/Sin drafts/) }))

    // Siguiente vuelta del worker: sigue esperando, sin repetir el aviso.
    const second = await advanceJob(first, fakeDeps(repository, { notify }))
    expect(second.status).toBe("LOCAL_COMPLETE")
    expect(notify).toHaveBeenCalledTimes(1)
    // Un fallo del servidor no pausa la producción de Automaty.
    expect(repository.getPipelineMode()).toBe("RUNNING")
  })

  it("reintenta solo los fallos temporales y retoma en el mismo paso", async () => {
    database = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(database)
    repository.addDrafts("frame_tv_art", ["9001"])
    const job = frameTvJob(repository, { video: false })
    const syncImages = vi.fn()
      .mockRejectedValueOnce(new Error("Etsy HTTP 503"))
      .mockResolvedValue(undefined)
    const deps = fakeDeps(repository, { syncImages })

    const failed = await advanceJob(job, deps)
    expect(failed.status).toBe("RETRY_WAIT")
    expect(failed.resumeStatus).toBe("ETSY_MEDIA_SYNCING")

    const resumed = await advanceJob(repository.getJob(job.id)!, deps)
    expect(resumed.status).toBe("WAITING_ETSY_REVIEW")
    expect(deps.generateSeo).toHaveBeenCalledTimes(1)
  })

  it("detecta la publicación y publica los 3 pines en el tablero del producto", async () => {
    database = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(database)
    repository.addDrafts("frame_tv_art", ["9001"])
    const job = frameTvJob(repository, { video: false })
    const deps = fakeDeps(repository)
    await advanceJob(job, deps)

    deps.getListing = vi.fn(async () => ({ state: "active", url: "https://www.etsy.com/listing/9001" }))
    repository.updatePostProductionFields(job.id, { nextAttemptAt: new Date(Date.now() - 1000).toISOString() })
    const results = await runPostProductionTick(deps)
    expect(results).toEqual([{ productCode: job.productCode, status: "COMPLETED" }])
    const done = repository.getJob(job.id)!
    expect(done.etsyUrl).toBe("https://www.etsy.com/listing/9001")
    expect(deps.findBoard).toHaveBeenCalledWith(expect.anything(), "Frame TV Art")
    expect(deps.publishPin).toHaveBeenCalledTimes(3)
    expect(vi.mocked(deps.publishPin).mock.calls[0][1]).toMatchObject({
      boardId: "77",
      link: "https://www.etsy.com/listing/9001",
      imageUrl: `https://files.example/pinterest/${job.productCode}/pin-1.jpg`,
      title: "Title pin-1",
    })
    expect(deps.recordPin).toHaveBeenCalledTimes(3)
    expect(JSON.parse(done.pinterestSeoJson!).pins.map((pin: { pinId: string }) => pin.pinId)).toEqual(["pin1", "pin2", "pin3"])
  })

  it("si un pin falla, el reintento no repite los ya publicados", async () => {
    database = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(database)
    repository.addDrafts("frame_tv_art", ["9001"])
    const job = frameTvJob(repository, { video: false })
    const publishPin = vi.fn()
      .mockResolvedValueOnce({ pinId: "a1", boardId: "77" })
      .mockRejectedValueOnce(new Error("Pinterest HTTP 503"))
      .mockResolvedValue({ pinId: "a2", boardId: "77" })
    const deps = fakeDeps(repository, {
      publishPin,
      getListing: vi.fn(async () => ({ state: "active", url: "https://www.etsy.com/listing/9001" })),
    })
    await advanceJob(job, deps)
    repository.updatePostProductionFields(job.id, { nextAttemptAt: new Date(Date.now() - 1000).toISOString() })
    const failed = await advanceJob(repository.getJob(job.id)!, deps)
    expect(failed.status).toBe("RETRY_WAIT")
    expect(failed.resumeStatus).toBe("PINTEREST_PUBLISHING")

    const done = await advanceJob(repository.getJob(job.id)!, deps)
    expect(done.status).toBe("COMPLETED")
    expect(publishPin).toHaveBeenCalledTimes(4)
    expect(deps.generatePinCopy).toHaveBeenCalledTimes(1)
  })

  it("avisa si no existe el tablero con el nombre del producto", async () => {
    database = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(database)
    repository.addDrafts("frame_tv_art", ["9001"])
    const job = frameTvJob(repository, { video: false })
    const deps = fakeDeps(repository, {
      findBoard: vi.fn(async () => null),
      getListing: vi.fn(async () => ({ state: "active", url: "https://www.etsy.com/listing/9001" })),
    })
    await advanceJob(job, deps)
    repository.updatePostProductionFields(job.id, { nextAttemptAt: new Date(Date.now() - 1000).toISOString() })
    const result = await advanceJob(repository.getJob(job.id)!, deps)
    expect(result.status).toBe("NEEDS_ATTENTION")
    expect(result.lastError).toBe('No hay un tablero de Pinterest llamado "Frame TV Art".')
  })

  it("al cancelar un trabajo fallido devuelve su draft al pool", async () => {
    database = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(database)
    repository.addDrafts("frame_tv_art", ["9001"])
    const job = frameTvJob(repository, { video: false })
    await advanceJob(job, fakeDeps(repository, { syncText: vi.fn(async () => { throw new Error("Bad request") }) }))
    expect(repository.getJob(job.id)!.status).toBe("NEEDS_ATTENTION")
    repository.cancelQueuedJob(job.id)
    expect(repository.getJob(job.id)!.status).toBe("CANCELED")
    expect(repository.listDrafts().find((draft) => draft.draftId === "9001")?.status).toBe("AVAILABLE")
  })

  it("no toca reintentos que pertenecen a Automaty", async () => {
    database = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(database)
    const job = repository.createJob({ productType: "frame_tv_art", sourcePrompt: "x" })
    for (const status of LOCAL_PATH.slice(0, 4)) repository.transitionJob(job.id, status)
    repository.transitionJob(job.id, "RETRY_WAIT", { error: "Photoshop", resumeStatus: "LOCAL_BUILDING" })
    expect(await runPostProductionTick(fakeDeps(repository))).toEqual([])
  })

  it("consulta en bloque los drafts que esperan y avisa al móvil", async () => {
    database = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(database)
    repository.addDrafts("frame_tv_art", ["9001", "9002"])
    const first = frameTvJob(repository, { video: false })
    const second = frameTvJob(repository, { video: false })
    const notify = vi.fn(async () => {})
    const deps = fakeDeps(repository, { notify })
    await runPostProductionTick(deps)
    expect(notify).toHaveBeenCalledTimes(2)
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      title: "Draft listo para revisar en Etsy",
      url: "https://www.etsy.com/your/shops/me/listing-editor/edit/9001",
    }))

    const getListingsBatch = vi.fn(async () => new Map([
      ["9001", { state: "active", url: "https://www.etsy.com/listing/9001" }],
      ["9002", { state: "draft" }],
    ]))
    const getListing = vi.fn(async () => ({ state: "draft" }))
    for (const job of [first, second]) {
      repository.updatePostProductionFields(job.id, { nextAttemptAt: new Date(Date.now() - 1000).toISOString() })
    }
    notify.mockClear()
    await runPostProductionTick({ ...deps, getListing, getListingsBatch })
    expect(getListingsBatch).toHaveBeenCalledTimes(1)
    expect(getListing).not.toHaveBeenCalled()
    expect(repository.getJob(first.id)!.status).toBe("COMPLETED")
    expect(repository.getJob(second.id)!.status).toBe("WAITING_ETSY_REVIEW")
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: "Listing completado", url: "https://www.etsy.com/listing/9001" }))
  })

  it("no avisa de estados intermedios", () => {
    database = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(database)
    const job = frameTvJob(repository)
    expect(notificationFor(job)).toBeNull()
  })

  it("resume la investigación de keywords del brief", () => {
    expect(keywordResearchFromBrief(null)).toBeNull()
    expect(keywordResearchFromBrief(JSON.stringify({
      primaryKeyword: { keyword: "boho rainbow", etsyMonthlySearches: 500, trend3m: 0.12 },
      secondaryKeywords: [],
    }))).toBe('Primary keyword: "boho rainbow" (500 searches/month, 3-month trend 12%)')
    expect(keywordResearchFromBrief(JSON.stringify({
      primaryKeyword: null,
      secondaryKeywords: [],
      tagCandidates: [{ keyword: "rainbow nursery", etsyMonthlySearches: 900, competition: "low" }],
      competitorListings: [{ title: "Boho Rainbow Print", tags: ["boho rainbow", "nursery decor"], estimatedMonthlySales: 40, listingScore: 8.5 }],
    }))).toBe([
      'Tag candidate: "rainbow nursery" (900 searches/month, competition low)',
      'Competitor listing (~40 sales/month, listing score 8.5) "Boho Rainbow Print": tags boho rainbow | nursery decor',
    ].join("\n"))
  })
})
