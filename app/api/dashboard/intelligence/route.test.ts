import { afterEach,describe,expect,it,vi } from "vitest"
const owner=vi.hoisted(()=>({requireOwnerApi:vi.fn()}))
const cookies=vi.hoisted(()=>({cookies:vi.fn()}))
const database=vi.hoisted(()=>({getAutomationDatabase:vi.fn()}))
const intelligence=vi.hoisted(()=>({getBusinessIntelligence:vi.fn()}))
vi.mock("@/lib/auth/owner",()=>owner)
vi.mock("next/headers",()=>cookies)
vi.mock("@/lib/automation/db/database",()=>database)
vi.mock("@/lib/dashboard/intelligence",()=>intelligence)
vi.mock("@/lib/dashboard/pinterest-analytics",()=>({hasPinterestAnalyticsScopes:vi.fn()}))
vi.mock("@/lib/etsy/auth",()=>({ETSY_AUTH_COOKIE:"etsy"}))
vi.mock("@/lib/pinterest/auth",()=>({PINTEREST_AUTH_COOKIE:"pinterest"}))
vi.mock("@/lib/dashboard/overview",()=>({isDashboardPeriod:(value:string)=>["7d","30d","90d"].includes(value)}))
import {GET} from "./route"
describe("intelligence route",()=>{
  afterEach(()=>vi.resetAllMocks())
  it("checks owner before reading cookies or database",async()=>{
    owner.requireOwnerApi.mockResolvedValue(Response.json({},{status:401}))
    expect((await GET(new Request("http://localhost/api/dashboard/intelligence"))).status).toBe(401)
    expect(cookies.cookies).not.toHaveBeenCalled()
    expect(database.getAutomationDatabase).not.toHaveBeenCalled()
  })
  it("rejects an invalid period without touching sources",async()=>{
    owner.requireOwnerApi.mockResolvedValue(null)
    expect((await GET(new Request("http://localhost/api/dashboard/intelligence?period=365d"))).status).toBe(400)
    expect(database.getAutomationDatabase).not.toHaveBeenCalled()
  })
})
