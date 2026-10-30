import { afterEach,describe,expect,it,vi } from "vitest"

const owner=vi.hoisted(()=>({requireOwnerApi:vi.fn()}))
const database=vi.hoisted(()=>({getAutomationDatabase:vi.fn()}))
vi.mock("@/lib/auth/owner",()=>owner)
vi.mock("@/lib/automation/db/database",()=>database)
vi.mock("@/lib/dashboard/etsy-traffic",()=>({trafficSnapshot:vi.fn(),saveTrafficObservation:vi.fn(),TrafficInputError:class extends Error{}}))
vi.mock("@/lib/dashboard/overview",()=>({isDashboardPeriod:(value:string|null)=>["7d","30d","90d"].includes(value ?? "")}))
import { GET,POST } from "./route"

describe("traffic route",()=>{
  afterEach(()=>vi.resetAllMocks())
  it("requires owner before reading or writing",async()=>{
    owner.requireOwnerApi.mockResolvedValue(Response.json({},{status:401}))
    expect((await GET(new Request("http://localhost/api/dashboard/traffic"))).status).toBe(401)
    expect((await POST(new Request("http://localhost/api/dashboard/traffic",{method:"POST",body:"{}"}))).status).toBe(401)
    expect(database.getAutomationDatabase).not.toHaveBeenCalled()
  })
  it("rejects invalid periods before touching the database",async()=>{
    owner.requireOwnerApi.mockResolvedValue(null)
    expect((await GET(new Request("http://localhost/api/dashboard/traffic?period=365d"))).status).toBe(400)
    expect((await POST(new Request("http://localhost/api/dashboard/traffic",{method:"POST",body:JSON.stringify({period:"365d",data:{visits:1}})}))).status).toBe(400)
    expect(database.getAutomationDatabase).not.toHaveBeenCalled()
  })
})
