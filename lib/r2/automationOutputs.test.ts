import { beforeAll, describe, expect, it } from "vitest"

let createAutomationOutputUpload: typeof import("./automationOutputs").createAutomationOutputUpload

beforeAll(async () => {
  process.env.R2_BUCKET = "test-bucket"
  process.env.R2_ENDPOINT = "https://account.r2.cloudflarestorage.com"
  process.env.R2_ACCESS_KEY_ID = "test-access-key"
  process.env.R2_SECRET_ACCESS_KEY = "test-secret-key"
  ;({ createAutomationOutputUpload } = await import("./automationOutputs"))
})

describe("createAutomationOutputUpload", () => {
  it("firma las cabeceras que envía el agente y no añade checksums de cuerpo vacío", async () => {
    const url = new URL(await createAutomationOutputUpload({
      key: "automation/outputs/LBCreaStudio-TEST/1.jpg",
      contentType: "image/jpeg",
      sha256: "a".repeat(64),
      byteSize: 1234,
    }))
    const params = [...url.searchParams.keys()].map((key) => key.toLowerCase())
    expect(params.some((key) => key.startsWith("x-amz-checksum"))).toBe(false)
    expect(params).not.toContain("x-amz-sdk-checksum-algorithm")
    expect(params.some((key) => key.startsWith("x-amz-meta-"))).toBe(false)
    const signed = (url.searchParams.get("X-Amz-SignedHeaders") || "").split(";")
    expect(signed).toEqual(expect.arrayContaining([
      "content-type",
      "host",
      "x-amz-meta-lifecycle",
      "x-amz-meta-sha256",
    ]))
  })
})
