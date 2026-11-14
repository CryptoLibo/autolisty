import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchAllowed, isEtsyImageUrl, isR2PublicUrl, validateUploadTarget } from "./safeFetch"

describe("safe fetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("valida cada salto antes de seguirlo", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://evil.example/x.png" } }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(fetchAllowed("https://cdn.kittl.com/a.png", (url) => url.hostname.endsWith("kittl.com"))).rejects.toThrow(/not allowed/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("solo R2 propio y fotos de Etsy", () => {
    vi.stubEnv("R2_PUBLIC_URL", "https://files.autolisty.com")
    vi.stubEnv("R2_LEGACY_PUBLIC_URL", "https://pub-abc.r2.dev")
    expect(isR2PublicUrl(new URL("https://files.autolisty.com/mockups/X/1.jpg"))).toBe(true)
    expect(isR2PublicUrl(new URL("https://pub-abc.r2.dev/mockups/X/1.jpg"))).toBe(true)
    expect(isR2PublicUrl(new URL("https://files.autolisty.com.evil.com/a"))).toBe(false)
    expect(isEtsyImageUrl(new URL("https://i.etsystatic.com/1/r/il/a.jpg"))).toBe(true)
    expect(isEtsyImageUrl(new URL("https://etsystatic.com.evil.io/a.jpg"))).toBe(false)
  })

  it("código y nombre de archivo de subidas manuales", () => {
    expect(validateUploadTarget("Q7ZZ9C", "Q7ZZ9C_mockup_1.jpg")).toBeNull()
    expect(validateUploadTarget("../x", "a.jpg")).toMatch(/code/)
    expect(validateUploadTarget("Q7ZZ9C", "../../a.jpg")).toMatch(/name/)
    expect(validateUploadTarget("Q7ZZ9C", "a/b.jpg")).toMatch(/name/)
  })
})
