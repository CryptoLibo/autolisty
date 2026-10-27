import { afterEach, describe, expect, it, vi } from "vitest"

const owner = vi.hoisted(() => ({ requireOwnerApi: vi.fn() }))
const database = vi.hoisted(() => ({ openAutomationReadDatabase: vi.fn(), getAutomationDatabase: vi.fn() }))
const alura = vi.hoisted(() => ({ fetchAluraUsage: vi.fn(), recordAluraDiagnostic: vi.fn() }))
vi.mock("@/lib/auth/owner", () => owner)
vi.mock("@/lib/automation/db/database", () => database)
vi.mock("@/lib/research/market/aluraUsage", () => alura)

import { POST } from "./route"

describe("Alura usage diagnostic route", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetAllMocks()
  })

  it("rejects an unauthenticated caller before reading credentials or opening the database", async () => {
    owner.requireOwnerApi.mockResolvedValue(Response.json({ error: "Unauthorized" }, { status: 401 }))
    const response = await POST()
    expect(response.status).toBe(401)
    expect(database.openAutomationReadDatabase).not.toHaveBeenCalled()
    expect(alura.fetchAluraUsage).not.toHaveBeenCalled()
  })

  it("runs only the usage probe in production and never returns the server key", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("ALURA_API_KEY", "private-test-key")
    owner.requireOwnerApi.mockResolvedValue(null)
    database.openAutomationReadDatabase.mockReturnValue({ close: vi.fn() })
    alura.fetchAluraUsage.mockResolvedValue({ state: "AVAILABLE", httpStatus: 200, latencyMs: 5,
      usage: { plan: "free", credits: { remaining: 80 }, rate_limit: { requests_per_minute: 30 } },
      creditsCost: 0, errorCode: null })
    const response = await POST()
    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(alura.fetchAluraUsage).toHaveBeenCalledOnce()
    expect(alura.fetchAluraUsage).toHaveBeenCalledWith("private-test-key")
    expect(alura.recordAluraDiagnostic).toHaveBeenCalledOnce()
    expect(await response.text()).not.toContain("private-test-key")
  })

  it("reports denied usage scope without returning provider details or credentials", async () => {
    vi.stubEnv("ALURA_API_KEY", "private-test-key")
    owner.requireOwnerApi.mockResolvedValue(null)
    database.openAutomationReadDatabase.mockReturnValue({ close: vi.fn() })
    alura.fetchAluraUsage.mockResolvedValue({ state: "NOT_AUTHORIZED", httpStatus: 403, latencyMs: 5,
      usage: null, creditsCost: null, errorCode: "http_403" })
    const response = await POST()
    expect(response.status).toBe(403)
    const body = await response.text()
    expect(body).toContain("usage:read")
    expect(body).not.toContain("private-test-key")
  })
})
