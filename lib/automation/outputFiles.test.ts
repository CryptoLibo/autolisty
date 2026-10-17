import { describe, expect, it } from "vitest"
import { classifyAutomationOutput, validateAutomationOutputFiles } from "./outputFiles"
import type { AutomationJobFile } from "./types"

function verified(slotKey: string): AutomationJobFile {
  return {
    id: slotKey,
    jobId: "job-1",
    slotKey,
    role: "TEST",
    position: null,
    relativePath: slotKey,
    r2Key: slotKey,
    contentType: "image/jpeg",
    byteSize: 1,
    sha256: "a".repeat(64),
    status: "VERIFIED",
    uploadedAt: null,
    verifiedAt: null,
    deletedAt: null,
    lastError: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

describe("automation output contracts", () => {
  it("maps final listing paths to established R2 prefixes", () => {
    expect(classifyAutomationOutput({
      productType: "png_designs",
      productCode: "LBCreaStudio-ABC123",
      relativePath: "Pines\\pin-2.jpg",
    })).toMatchObject({
      slotKey: "pinterest:2",
      r2Key: "pinterest/LBCreaStudio-ABC123/pin-2.jpg",
    })

    expect(classifyAutomationOutput({
      productType: "png_designs",
      productCode: "LBCreaStudio-ABC123",
      relativePath: "Diseños Finales/Design.png",
    })).toMatchObject({
      slotKey: "deliverable:design",
      r2Key: "deliverables/LBCreaStudio-ABC123/Design.png",
    })
  })

  it("rejects traversal and files outside the production contract", () => {
    expect(() => classifyAutomationOutput({
      productType: "png_designs",
      productCode: "LBCreaStudio-ABC123",
      relativePath: "../secret.txt",
    })).toThrow("Invalid listing output path")
    expect(() => classifyAutomationOutput({
      productType: "png_designs",
      productCode: "LBCreaStudio-ABC123",
      relativePath: "Midjourney.png",
    })).toThrow("Unsupported listing media file")
  })

  it("requires every PNG listing, Pinterest, and delivery slot", () => {
    const files = [1, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((slot) => verified(`listing:${slot}`))
    files.push(verified("pinterest:1"), verified("pinterest:2"), verified("pinterest:3"))
    expect(() => validateAutomationOutputFiles("png_designs", files)).toThrow("deliverable:design")
    files.push(verified("deliverable:design"))
    expect(validateAutomationOutputFiles("png_designs", files).optionalVideoPresent).toBe(false)
  })
})
