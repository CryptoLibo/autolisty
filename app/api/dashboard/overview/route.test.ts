import { afterEach, describe, expect, it, vi } from "vitest"

const owner = vi.hoisted(() => ({ requireOwnerApi: vi.fn() }))
const database = vi.hoisted(() => ({ getAutomationDatabase: vi.fn() }))
const overview = vi.hoisted(() => ({ getDashboardOverview: vi.fn() }))
vi.mock("@/lib/auth/owner", () => owner)
vi.mock("@/lib/automation/db/database", () => database)
vi.mock("@/lib/dashboard/overview", () => ({
  isDashboardPeriod: (value: string | null) => value === "7d" || value === "30d" || value === "90d",
  getDashboardOverview: overview.getDashboardOverview,
}))

import { GET } from "./route"

describe("Dashboard overview route", () => {
  afterEach(() => vi.resetAllMocks())

  it("requires owner authentication before reading the database", async () => {
    owner.requireOwnerApi.mockResolvedValue(Response.json({ error: "Unauthorized" }, { status: 401 }))
    const response = await GET(new Request("http://localhost/api/dashboard/overview?period=7d"))
    expect(response.status).toBe(401)
    expect(database.getAutomationDatabase).not.toHaveBeenCalled()
  })

  it("rejects unsupported periods before opening the database", async () => {
    owner.requireOwnerApi.mockResolvedValue(null)
    const response = await GET(new Request("http://localhost/api/dashboard/overview?period=all"))
    expect(response.status).toBe(400)
    expect(database.getAutomationDatabase).not.toHaveBeenCalled()
  })

  it("returns only the requested Automation period without caching", async () => {
    owner.requireOwnerApi.mockResolvedValue(null)
    overview.getDashboardOverview.mockReturnValue({ source: "automation", period: "30d", total: 0 })
    const response = await GET(new Request("http://localhost/api/dashboard/overview?period=30d"))
    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(overview.getDashboardOverview).toHaveBeenCalledWith(undefined, "30d")
    expect(await response.json()).toMatchObject({ source: "automation", total: 0 })
  })
})
