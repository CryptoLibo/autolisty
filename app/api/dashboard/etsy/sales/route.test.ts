import { afterEach, describe, expect, it, vi } from "vitest"

const owner = vi.hoisted(() => ({ requireOwnerApi: vi.fn() }))
const database = vi.hoisted(() => ({ getAutomationDatabase: vi.fn() }))
const cookies = vi.hoisted(() => ({ cookies: vi.fn() }))
const sales = vi.hoisted(() => ({ getSalesSnapshot: vi.fn() }))
vi.mock("@/lib/auth/owner", () => owner)
vi.mock("@/lib/automation/db/database", () => database)
vi.mock("@/lib/etsy/auth", () => ({ ETSY_AUTH_COOKIE: "etsy_auth" }))
vi.mock("next/headers", () => cookies)
vi.mock("@/lib/dashboard/etsy-sales", () => sales)
vi.mock("@/lib/dashboard/overview", () => ({ isDashboardPeriod: (value: string) => ["7d", "30d", "90d"].includes(value) }))

import { GET } from "./route"

describe("Etsy sales cached route", () => {
  afterEach(() => vi.resetAllMocks())
  it("requires the owner before opening the database", async () => {
    owner.requireOwnerApi.mockResolvedValue(Response.json({}, { status: 401 }))
    expect((await GET(new Request("http://localhost/api/dashboard/etsy/sales"))).status).toBe(401)
    expect(database.getAutomationDatabase).not.toHaveBeenCalled()
  })
  it("reports missing scope without a provider call", async () => {
    owner.requireOwnerApi.mockResolvedValue(null)
    cookies.cookies.mockResolvedValue({ get: () => ({ value: JSON.stringify({ scope: ["shops_r", "listings_r"] }) }) })
    sales.getSalesSnapshot.mockReturnValue({ authorized: false, status: "missing_scope" })
    const response = await GET(new Request("http://localhost/api/dashboard/etsy/sales?period=7d"))
    expect(response.status).toBe(200)
    expect(sales.getSalesSnapshot).toHaveBeenCalledWith(undefined, "7d", true, false)
    expect(await response.json()).toMatchObject({ status: "missing_scope" })
  })
})
