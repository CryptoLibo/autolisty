import { afterEach, describe, expect, it, vi } from "vitest"

const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }))
const auth = vi.hoisted(() => ({ exchangeCodeForToken: vi.fn() }))
vi.mock("next/headers", () => ({ cookies: async () => jar }))
vi.mock("@/lib/etsy/auth", () => ({
  ETSY_AUTH_COOKIE: "etsy_auth", ETSY_PKCE_COOKIE: "etsy_pkce",
  ETSY_SCOPES: ["shops_r", "listings_r", "listings_w", "transactions_r"],
  getEtsyRedirectUri: () => "https://autolisty.com/api/etsy/auth/callback",
  exchangeCodeForToken: auth.exchangeCodeForToken,
}))

import { GET } from "./route"

describe("Etsy scope upgrade", () => {
  afterEach(() => vi.resetAllMocks())
  it("preserves the existing cookie when Etsy grants only a subset", async () => {
    jar.get.mockReturnValue({ value: JSON.stringify({ state: "state", codeVerifier: "verifier" }) })
    auth.exchangeCodeForToken.mockResolvedValue({ scope: ["transactions_r"] })
    const response = await GET(new Request("https://autolisty.com/api/etsy/auth/callback?code=code&state=state"))
    expect(response.status).toBe(307)
    expect(jar.set).not.toHaveBeenCalled()
    expect(response.headers.get("location")).toContain("etsy_error=")
  })
  it("accepts all old and new scopes only after explicit authorization", async () => {
    jar.get.mockReturnValue({ value: JSON.stringify({ state: "state", codeVerifier: "verifier" }) })
    auth.exchangeCodeForToken.mockResolvedValue({ scope: ["shops_r", "listings_r", "listings_w", "transactions_r"] })
    const response = await GET(new Request("https://autolisty.com/api/etsy/auth/callback?code=code&state=state"))
    expect(response.status).toBe(307)
    expect(jar.set).toHaveBeenCalledWith("etsy_auth", expect.any(String), expect.objectContaining({ httpOnly: true, secure: true }))
  })
})
