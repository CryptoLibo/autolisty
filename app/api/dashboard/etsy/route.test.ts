import { afterEach, describe, expect, it, vi } from "vitest"

const owner = vi.hoisted(() => ({ requireOwnerApi: vi.fn() }))
const database = vi.hoisted(() => ({ getAutomationDatabase: vi.fn() }))
const cookies = vi.hoisted(() => ({ cookies: vi.fn() }))
const catalog = vi.hoisted(() => ({ getCatalogSnapshot: vi.fn() }))
vi.mock("@/lib/auth/owner", () => owner)
vi.mock("@/lib/automation/db/database", () => database)
vi.mock("@/lib/etsy/auth", () => ({ ETSY_AUTH_COOKIE: "etsy_auth" }))
vi.mock("next/headers", () => cookies)
vi.mock("@/lib/dashboard/etsy-catalog", () => catalog)
vi.mock("@/lib/dashboard/overview", () => ({ isDashboardPeriod: (value: string) => ["7d", "30d", "90d"].includes(value) }))

import { GET } from "./route"

describe("Etsy dashboard cached route", () => {
  afterEach(() => vi.resetAllMocks())

  it("requires the owner before reading the cookie or database", async () => {
    owner.requireOwnerApi.mockResolvedValue(Response.json({}, { status: 401 }))
    expect((await GET(new Request("http://localhost/api/dashboard/etsy"))).status).toBe(401)
    expect(cookies.cookies).not.toHaveBeenCalled()
    expect(database.getAutomationDatabase).not.toHaveBeenCalled()
  })

  it("rejects invalid periods before reading data", async () => {
    owner.requireOwnerApi.mockResolvedValue(null)
    expect((await GET(new Request("http://localhost/api/dashboard/etsy?period=all"))).status).toBe(400)
    expect(database.getAutomationDatabase).not.toHaveBeenCalled()
  })

  it("returns only cached data without calling Etsy", async () => {
    owner.requireOwnerApi.mockResolvedValue(null)
    cookies.cookies.mockResolvedValue({ get: () => ({ value: "private-cookie" }) })
    catalog.getCatalogSnapshot.mockReturnValue({ connected: true, counts: { active: 2 } })
    const response = await GET(new Request("http://localhost/api/dashboard/etsy?period=7d"))
    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(await response.text()).not.toContain("private-cookie")
    expect(catalog.getCatalogSnapshot).toHaveBeenCalledWith(undefined, "7d", true)
  })
})
