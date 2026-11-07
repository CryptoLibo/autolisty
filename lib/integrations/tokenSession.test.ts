import { afterEach, describe, expect, it, vi } from "vitest"

const vault = vi.hoisted(() => {
  const store = new Map<string, unknown>()
  return {
    store,
    readCredential: vi.fn((provider: string) => store.get(provider) ?? null),
    writeCredential: vi.fn((provider: string, value: unknown) => { store.set(provider, value) }),
    deleteCredential: vi.fn((provider: string) => { store.delete(provider) }),
  }
})
const etsy = vi.hoisted(() => ({ refreshEtsyToken: vi.fn() }))
const pinterest = vi.hoisted(() => ({ refreshPinterestToken: vi.fn() }))
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }))

vi.mock("./credentialVault", () => vault)
vi.mock("next/headers", () => ({ cookies: async () => jar }))
vi.mock("@/lib/etsy/auth", () => ({ ETSY_AUTH_COOKIE: "etsy_auth", ETSY_PKCE_COOKIE: "etsy_pkce", ...etsy }))
vi.mock("@/lib/pinterest/auth", () => ({ PINTEREST_AUTH_COOKIE: "pinterest_auth", PINTEREST_PKCE_COOKIE: "pinterest_pkce", ...pinterest }))

import { clearToken, getFreshToken, loadToken } from "./tokenSession"

const etsyToken = (overrides: Record<string, unknown> = {}) => ({
  access_token: "1.access", refresh_token: "refresh-1", expires_at: Date.now() + 3_600_000,
  token_type: "Bearer", user_id: "1", scope: ["shops_r"], ...overrides,
})

describe("token session", () => {
  afterEach(() => {
    vault.store.clear()
    vi.clearAllMocks()
  })

  it("importa una vez la cookie existente a la bóveda", async () => {
    jar.get.mockReturnValue({ value: JSON.stringify(etsyToken()) })
    expect((await loadToken("etsy"))?.access_token).toBe("1.access")
    expect(vault.writeCredential).toHaveBeenCalledTimes(1)
    jar.get.mockReturnValue(undefined)
    expect((await loadToken("etsy"))?.access_token).toBe("1.access")
  })

  it("refresca una sola vez aunque haya peticiones simultáneas (Etsy rota el refresh token)", async () => {
    vault.store.set("etsy", etsyToken({ expires_at: Date.now() + 10_000 }))
    etsy.refreshEtsyToken.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return etsyToken({ access_token: "1.new", refresh_token: "refresh-2" })
    })
    const [a, b] = await Promise.all([getFreshToken("etsy"), getFreshToken("etsy")])
    expect(etsy.refreshEtsyToken).toHaveBeenCalledTimes(1)
    expect(etsy.refreshEtsyToken).toHaveBeenCalledWith("refresh-1")
    expect(a?.access_token).toBe("1.new")
    expect(b?.access_token).toBe("1.new")
    expect((vault.store.get("etsy") as { refresh_token: string }).refresh_token).toBe("refresh-2")
  })

  it("conserva el refresh token de Pinterest si la respuesta no trae uno nuevo", async () => {
    vault.store.set("pinterest", { access_token: "p1", refresh_token: "pr", expires_at: Date.now(), scope: [], token_type: "bearer" })
    pinterest.refreshPinterestToken.mockResolvedValue({ access_token: "p2", expires_at: Date.now() + 3_600_000, scope: [], token_type: "bearer" })
    const token = await getFreshToken("pinterest")
    expect(token?.access_token).toBe("p2")
    expect(token?.refresh_token).toBe("pr")
  })

  it("funciona sin petición (worker): sin cookies, solo bóveda", async () => {
    vault.store.set("etsy", etsyToken())
    expect((await getFreshToken("etsy"))?.access_token).toBe("1.access")
  })

  it("desconectar borra bóveda y cookies", async () => {
    vault.store.set("etsy", etsyToken())
    await clearToken("etsy")
    expect(vault.store.has("etsy")).toBe(false)
    expect(jar.delete).toHaveBeenCalledWith("etsy_auth")
  })
})
