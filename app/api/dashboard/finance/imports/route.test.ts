import { afterEach, describe, expect, it, vi } from "vitest"

const owner = vi.hoisted(() => ({ requireOwnerApi: vi.fn() }))
const database = vi.hoisted(() => ({ getAutomationDatabase: vi.fn() }))
const finance = vi.hoisted(() => ({ previewStatement: vi.fn(), importStatement: vi.fn(), FinanceValidationError: class extends Error {} }))
vi.mock("@/lib/auth/owner", () => owner)
vi.mock("@/lib/automation/db/database", () => database)
vi.mock("@/lib/dashboard/finance", () => finance)
import { POST } from "./route"

describe("finance CSV API", () => {
  afterEach(() => vi.resetAllMocks())
  it("rejects unauthorized previews before reading the file or database", async () => {
    owner.requireOwnerApi.mockResolvedValue(Response.json({}, { status: 401 }))
    const response = await POST(new Request("http://localhost/api/dashboard/finance/imports", { method: "POST", body: "{}" }))
    expect(response.status).toBe(401)
    expect(database.getAutomationDatabase).not.toHaveBeenCalled()
  })
  it("returns a preview without touching persistence", async () => {
    owner.requireOwnerApi.mockResolvedValue(null)
    finance.previewStatement.mockReturnValue({ fileHash: "abc", total: 1, accepted: [{}], rejected: [] })
    const content = 'Date,Type,Title,Info,Currency,Amount,"Fees & Taxes",Net,"Tax Details"\n"October 30, 2026",Sale,Order,,EUR,€5.00,--,€5.00,--'
    const response = await POST(new Request("http://localhost/api/dashboard/finance/imports", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({content,filename:"statement.csv"}) }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ total: 1, accepted: 1, rejected: [] })
    expect(database.getAutomationDatabase).not.toHaveBeenCalled()
  })
})
