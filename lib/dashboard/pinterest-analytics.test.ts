import Database from "better-sqlite3"
import { describe, expect, it, vi } from "vitest"
import { openAutomationDatabase } from "../automation/db/database"
import { AUTOMATION_SCHEMA_VERSION, runAutomationMigrations } from "../automation/db/migrations"
import type { PinterestTokenPayload } from "../pinterest/auth"
import { etsyListingIdFromUrl, getPinterestSnapshot, hasPinterestAnalyticsScopes, recordPublishedPin,
  syncPinterestAnalytics } from "./pinterest-analytics"

const now = new Date("2026-10-30T12:00:00Z")
const token = {access_token:"test",expires_at:Date.now()+60_000,scope:["user_accounts:read","pins:read","pins:write","boards:read","boards:write"],token_type:"bearer"} as PinterestTokenPayload
const values = {IMPRESSION:100,SAVE:5,PIN_CLICK:9,OUTBOUND_CLICK:3,ENGAGEMENT:12}
function api(options?: { pins?: Array<{pin_id:string;metrics:typeof values}>; pages?:number; fail?:string; accountEmpty?:boolean }) {
  const calls:string[] = []
  const fetcher = vi.fn(async (path:string) => {
    calls.push(path)
    if (path === options?.fail) return new Response("failed",{status:429})
    if (path === "/user_account") return Response.json({id:"123",account_type:"BUSINESS"})
    if (path.startsWith("/user_account/analytics/top_pins")) return Response.json({pins:options?.pins ?? []})
    if (path.startsWith("/user_account/analytics?")) return Response.json({ALL:{summary_metrics:options?.accountEmpty ? {} : values,
      daily_metrics:options?.accountEmpty ? [] : [{date:"2026-10-30",data_status:"READY",metrics:values}]}})
    if (path.startsWith("/pins?")) {
      const page = Number(new URL(path,"https://api.pinterest.com").searchParams.get("bookmark") ?? "0")
      return Response.json({items:page===0 ? [{id:"456",board_id:"22",title:"Sample",link:"https://www.etsy.com/listing/789/item",
        media:{images:{"150x150":{url:"https://i.pinimg.com/test.jpg"}}}}] : [],
        bookmark:page+1<(options?.pages ?? 1) ? String(page+1) : null})
    }
    throw new Error(`unexpected path ${path}`)
  })
  return {fetcher,calls}
}

describe("Pinterest analytics", () => {
  it("migrates v13 while retaining finance data", () => {
    const db = new Database(":memory:")
    try { expect(runAutomationMigrations(db,13)).toBe(13)
      db.prepare("INSERT INTO finance_csv_imports(id,file_hash,filename,row_count,accepted_count,rejected_count,status,created_at) VALUES ('a','b','c',0,0,0,'active','2026-10-30')").run()
      expect(runAutomationMigrations(db)).toBe(AUTOMATION_SCHEMA_VERSION)
      expect((db.prepare("SELECT COUNT(*) AS n FROM finance_csv_imports").get() as {n:number}).n).toBe(1)
    } finally {db.close()}
  })
  it("requires read scopes and only links unambiguous HTTPS Etsy listing URLs", () => {
    expect(hasPinterestAnalyticsScopes(token.scope)).toBe(true)
    expect(hasPinterestAnalyticsScopes(["pins:write"])).toBe(false)
    expect(etsyListingIdFromUrl("https://www.etsy.com/listing/789/item?ref=pin")).toBe(789)
    expect(etsyListingIdFromUrl("https://evil.example/listing/789")).toBeNull()
    expect(etsyListingIdFromUrl("http://etsy.com/listing/789")).toBeNull()
    expect(etsyListingIdFromUrl("https://etsy.com/listing/7890other")).toBeNull()
  })
  it("persists published IDs and exact listing link", () => {
    const db = openAutomationDatabase(":memory:")
    try {recordPublishedPin(db,{pinId:"456",boardId:"22",title:"Pin",destinationUrl:"https://www.etsy.com/listing/789/item"})
      expect(db.prepare("SELECT listing_id,published_via_autolisty FROM dashboard_pinterest_pins WHERE pin_id='456'").get())
        .toEqual({listing_id:789,published_via_autolisty:1})
    } finally {db.close()}
  })
  it("syncs three periods and top pins without duplicating summaries", async () => {
    const db = openAutomationDatabase(":memory:")
    try {
      const mock = api({pins:[{pin_id:"456",metrics:values}]})
      const result = await syncPinterestAnalytics(db,token,"30d",mock.fetcher,now)
      expect(result).toMatchObject({status:"complete",topPins:1,pinsComplete:true})
      expect(mock.calls.filter(path=>path.startsWith("/user_account/analytics?"))).toHaveLength(3)
      const snapshot = getPinterestSnapshot(db,"30d",true,true,now)
      expect(snapshot.totals).toMatchObject({impressions:100,saves:5,outboundClicks:3,engagementRate:0.12})
      expect(snapshot.pins[0]).toMatchObject({id:"456",listingId:789,boardId:"22"})
      expect(snapshot.linked[0]).toMatchObject({listingId:789,pinCount:1,outboundClicks:3})
      expect(getPinterestSnapshot(db,"7d",true,true,now).totals?.impressions).toBe(100)
      expect((await syncPinterestAnalytics(db,token,"30d",mock.fetcher,now).catch((error:Error)=>error.message))).toBe("sync_recent_or_running")
    } finally {db.close()}
  })
  it("marks incomplete pin pagination as partial and preserves an empty top", async () => {
    const db = openAutomationDatabase(":memory:")
    try { const mock=api({pages:5,accountEmpty:true})
      const result=await syncPinterestAnalytics(db,token,"90d",mock.fetcher,now)
      expect(result.status).toBe("partial")
      expect(result.pinsComplete).toBe(false)
      expect(getPinterestSnapshot(db,"90d",true,true,now).pins).toEqual([])
    } finally {db.close()}
  })
  it("keeps the last successful cache after a rate limit", async () => {
    const db = openAutomationDatabase(":memory:")
    try { await syncPinterestAnalytics(db,token,"30d",api().fetcher,now)
      const later = new Date(now.getTime()+11*60_000)
      const mock = api()
      mock.fetcher.mockImplementationOnce(async()=>Response.json({id:"123"}))
      mock.fetcher.mockImplementationOnce(async()=>new Response("limited",{status:429}))
      await expect(syncPinterestAnalytics(db,token,"30d",mock.fetcher,later)).rejects.toMatchObject({code:"rate_limited"})
      const snapshot=getPinterestSnapshot(db,"30d",true,true,later)
      expect(snapshot.status).toBe("failed")
      expect(snapshot.totals?.impressions).toBe(100)
    } finally {db.close()}
  })
  it("never calls Pinterest when the token lacks read scope", async () => {
    const db=openAutomationDatabase(":memory:");const mock=api()
    try {await expect(syncPinterestAnalytics(db,{...token,scope:["pins:write"]},"30d",mock.fetcher,now)).rejects.toMatchObject({code:"missing_scope"})
      expect(mock.fetcher).not.toHaveBeenCalled()
    } finally {db.close()}
  })
})
