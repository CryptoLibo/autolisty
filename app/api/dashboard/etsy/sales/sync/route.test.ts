import { afterEach, describe, expect, it, vi } from "vitest"

const owner = vi.hoisted(() => ({ requireOwnerApi: vi.fn() }))
const session = vi.hoisted(() => ({ loadToken: vi.fn(), getFreshToken: vi.fn() }))
const database = vi.hoisted(() => ({ getAutomationDatabase: vi.fn() }))
const shops = vi.hoisted(() => ({ getPrimaryShop: vi.fn() }))
const sales = vi.hoisted(() => ({ syncEtsySales: vi.fn() }))
vi.mock("@/lib/auth/owner", () => owner)
vi.mock("@/lib/integrations/tokenSession", () => session)
vi.mock("@/lib/automation/db/database", () => database)
vi.mock("@/lib/etsy/listings", () => shops)
vi.mock("@/lib/dashboard/etsy-sales", () => ({ SalesSyncError: class extends Error {}, syncEtsySales: sales.syncEtsySales }))

import { POST } from "./route"

describe("Etsy sales sync route", () => {
  afterEach(() => vi.resetAllMocks())
  it("rejects unauthenticated requests without reading Etsy state", async () => {
    owner.requireOwnerApi.mockResolvedValue(Response.json({}, { status: 401 }))
    expect((await POST()).status).toBe(401)
    expect(session.loadToken).not.toHaveBeenCalled()
  })
  it("blocks requests without transactions_r before any provider call", async () => {
    owner.requireOwnerApi.mockResolvedValue(null)
    session.loadToken.mockResolvedValue({ scope: ["shops_r", "listings_r"] })
    const response = await POST()
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: "missing_scope" })
    expect(session.getFreshToken).not.toHaveBeenCalled()
    expect(shops.getPrimaryShop).not.toHaveBeenCalled()
  })
})
