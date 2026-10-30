import { afterEach,describe,expect,it,vi } from "vitest"

const owner=vi.hoisted(()=>({requireOwnerApi:vi.fn()}))
const database=vi.hoisted(()=>({getAutomationDatabase:vi.fn()}))
const cookie=vi.hoisted(()=>({cookies:vi.fn()}))
const analytics=vi.hoisted(()=>({getPinterestSnapshot:vi.fn(),hasPinterestAnalyticsScopes:vi.fn()}))
vi.mock("@/lib/auth/owner",()=>owner)
vi.mock("@/lib/automation/db/database",()=>database)
vi.mock("next/headers",()=>cookie)
vi.mock("@/lib/pinterest/auth",()=>({PINTEREST_AUTH_COOKIE:"pinterest_auth"}))
vi.mock("@/lib/dashboard/pinterest-analytics",()=>analytics)
vi.mock("@/lib/dashboard/overview",()=>({isDashboardPeriod:(value:string)=>["7d","30d","90d"].includes(value)}))
import {GET} from "./route"

describe("Pinterest dashboard cached route",()=>{
  afterEach(()=>vi.resetAllMocks())
  it("requires owner before reading cookie or database",async()=>{
    owner.requireOwnerApi.mockResolvedValue(Response.json({},{status:401}))
    expect((await GET(new Request("http://localhost/api/dashboard/pinterest"))).status).toBe(401)
    expect(cookie.cookies).not.toHaveBeenCalled()
  })
  it("rejects invalid periods without reading data",async()=>{
    owner.requireOwnerApi.mockResolvedValue(null)
    expect((await GET(new Request("http://localhost/api/dashboard/pinterest?period=365d"))).status).toBe(400)
    expect(database.getAutomationDatabase).not.toHaveBeenCalled()
  })
  it("serves cache without a provider request",async()=>{
    owner.requireOwnerApi.mockResolvedValue(null)
    cookie.cookies.mockResolvedValue({get:()=>({value:JSON.stringify({scope:["pins:read","user_accounts:read"]})})})
    analytics.hasPinterestAnalyticsScopes.mockReturnValue(true)
    analytics.getPinterestSnapshot.mockReturnValue({status:"complete"})
    const response=await GET(new Request("http://localhost/api/dashboard/pinterest?period=7d"))
    expect(response.status).toBe(200)
    expect(analytics.getPinterestSnapshot).toHaveBeenCalledWith(undefined,"7d",true,true)
    expect(await response.json()).toEqual({status:"complete"})
  })
})
