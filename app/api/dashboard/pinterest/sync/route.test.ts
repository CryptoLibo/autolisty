import { afterEach, describe, expect, it, vi } from "vitest"

const owner = vi.hoisted(() => ({ requireOwnerApi: vi.fn() }))
const session = vi.hoisted(() => ({ loadToken: vi.fn(), getFreshToken: vi.fn() }))
const analytics = vi.hoisted(() => ({ syncPinterestAnalytics: vi.fn() }))
const database = vi.hoisted(() => ({ getAutomationDatabase: vi.fn() }))
vi.mock("@/lib/auth/owner", () => owner)
vi.mock("@/lib/integrations/tokenSession", () => session)
vi.mock("@/lib/dashboard/pinterest-analytics", () => analytics)
vi.mock("@/lib/automation/db/database", () => database)
vi.mock("@/lib/dashboard/overview", () => ({ isDashboardPeriod: (value: string) => ["7d", "30d", "90d"].includes(value) }))
import { POST } from "./route"

const request = (period: string) => new Request("http://localhost/api/dashboard/pinterest/sync", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period }),
})

describe("Pinterest dashboard sync route", () => {
  afterEach(() => vi.resetAllMocks())
  it("requires the owner before accessing cookies or Pinterest", async () => {
    owner.requireOwnerApi.mockResolvedValue(Response.json({}, { status: 401 }))
    expect((await POST(request("30d"))).status).toBe(401)
    expect(session.loadToken).not.toHaveBeenCalled()
    expect(analytics.syncPinterestAnalytics).not.toHaveBeenCalled()
  })
  it("rejects an invalid period without a provider request", async () => {
    owner.requireOwnerApi.mockResolvedValue(null)
    expect((await POST(request("365d"))).status).toBe(400)
    expect(session.loadToken).not.toHaveBeenCalled()
    expect(analytics.syncPinterestAnalytics).not.toHaveBeenCalled()
  })
  it("does not sync without a Pinterest connection", async () => {
    owner.requireOwnerApi.mockResolvedValue(null)
    session.loadToken.mockResolvedValue(null)
    expect((await POST(request("30d"))).status).toBe(401)
    expect(analytics.syncPinterestAnalytics).not.toHaveBeenCalled()
  })
})
