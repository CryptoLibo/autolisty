import { afterEach, describe, expect, it, vi } from "vitest"
import type Database from "better-sqlite3"
import { openAutomationDatabase } from "./db/database"
import { AutomationRepository } from "./repository"
import { applyNextMediaRefresh, MediaRefreshRepository, originalArchiveKey, refreshR2Key, refreshSlots, refreshSourceSlots, requestMediaRefresh } from "./mediaRefresh"

let database: Database.Database | null = null
afterEach(() => { database?.close(); database = null })

function completedJob(repository: AutomationRepository, productType: "horizontal_wall_art" | "frame_tv_art") {
  const job = repository.createJob({ productType, sourcePrompt: "test design" })
  database!.prepare("UPDATE automation_jobs SET status = 'COMPLETED', etsy_draft_id = '9001' WHERE id = ?").run(job.id)
  return repository.getJob(job.id)!
}

describe("regeneración de medios", () => {
  it("horizontal: fotos generadas (sin las fijas) y vídeo; resto: solo vídeo", () => {
    expect(refreshSlots("horizontal_wall_art", "images_video")).toEqual([1, 12, 3, 4, 6, 7, 9, 10, 2])
    expect(refreshSlots("frame_tv_art", "video")).toEqual([2])
    expect(refreshR2Key("LBCreaStudio-AAAAAA", "12345678-abcd", "7.jpg")).toBe("mockups/LBCreaStudio-AAAAAA/refresh-12345678/7.jpg")
    // La original de Kittl va a la carpeta privada del listing y se usa antes que el entregable.
    expect(originalArchiveKey("LBCreaStudio-AAAAAA", "sources/x/Design.PNG")).toBe("deliverables/LBCreaStudio-AAAAAA/original.png")
    expect(refreshSourceSlots("horizontal_wall_art")).toEqual(["original:primary", "deliverable:ratio_3_2"])
  })

  it("exige aprobación del dueño y no duplica una regeneración en curso", () => {
    database = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(database)
    const refreshes = new MediaRefreshRepository(database)
    const job = completedJob(repository, "horizontal_wall_art")
    expect(() => requestMediaRefresh({ productCodes: [job.productCode] }, { repository, refreshes })).toThrow(/approval/)
    const first = requestMediaRefresh({ productCodes: [job.productCode], ownerApproved: true }, { repository, refreshes })
    expect(first.queued).toBe(1)
    expect(first.results[0].scope).toBe("images_video")
    const second = requestMediaRefresh({ productCodes: [job.productCode], ownerApproved: true }, { repository, refreshes })
    expect(second.queued).toBe(0)
    expect(refreshes.claimForAgent("agent-1")?.status).toBe("LOCAL_BUILDING")
  })

  it("sustituye en Etsy las fotos generadas por posición y el vídeo", async () => {
    database = openAutomationDatabase(":memory:")
    const repository = new AutomationRepository(database)
    const refreshes = new MediaRefreshRepository(database)
    const job = completedJob(repository, "horizontal_wall_art")
    const { refresh } = refreshes.enqueue(job.id, "images_video")
    for (const slot of refreshSlots("horizontal_wall_art", "images_video")) {
      const relativePath = slot === 2 ? "2.mp4" : `${slot}.jpg`
      refreshes.registerFile(refresh.id, { slotKey: `listing:${slot}`, relativePath, r2Key: refreshR2Key(job.productCode, refresh.id, relativePath), contentType: "image/jpeg", byteSize: 1, sha256: "b".repeat(64) })
      refreshes.verifyFile(refresh.id, `listing:${slot}`)
    }
    refreshes.update(refresh.id, { status: "UPLOADED" })
    const replaceImage = vi.fn(async () => {})
    const replaceVideo = vi.fn(async () => {})
    const generateAltTexts = vi.fn(async (input: { images: Array<{ position: number }> }) => new Map(input.images.map((image) => [image.position, `alt ${image.position}`])))
    await applyNextMediaRefresh({
      refreshes,
      repository,
      getEtsyToken: async () => ({ access_token: "t" } as never),
      getShopId: async () => 1,
      publicUrl: (key) => `https://files/${key}`,
      replaceImage,
      replaceVideo,
      generateAltTexts,
      getListingTitle: async () => "Winter Birch Tree Painting",
    })
    // Etsy: posiciones 1,2,3,4,6,7,9,10 (5, 8 y 11 son las fijas de la tienda).
    expect(replaceImage.mock.calls.map((call) => (call as unknown as [unknown, { rank: number }])[1].rank)).toEqual([1, 2, 3, 4, 6, 7, 9, 10])
    expect((replaceImage.mock.calls[0] as unknown as [unknown, { altText: string }])[1].altText).toBe("alt 1")
    expect(replaceVideo).toHaveBeenCalledWith(expect.anything(), { url: expect.stringContaining("/refresh-"), name: `${job.productCode}.mp4` })
    expect(refreshes.get(refresh.id)?.status).toBe("DONE")
  })
})
