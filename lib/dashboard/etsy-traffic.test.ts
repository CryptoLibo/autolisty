import { describe,expect,it } from "vitest"
import { openAutomationDatabase } from "../automation/db/database"
import { saveTrafficObservation,trafficSnapshot } from "./etsy-traffic"

describe("Etsy traffic observations",()=>{
  it("records exact-window Shop Stats values and updates without duplicate rows",()=>{
    const db=openAutomationDatabase(":memory:");const now=new Date("2026-10-30T12:00:00Z")
    try {
      expect(trafficSnapshot(db,"7d",now).observation).toBeNull()
      saveTrafficObservation(db,"7d",{visits:20,listingViews:35,socialVisits:5,pinterestVisits:2},now)
      saveTrafficObservation(db,"7d",{visits:21,listingViews:37,socialVisits:5,pinterestVisits:3},now)
      expect(trafficSnapshot(db,"7d",now).observation).toMatchObject({visits:21,listingViews:37,pinterestVisits:3,source:"etsy_shop_stats_manual"})
      expect((db.prepare("SELECT COUNT(*) AS n FROM dashboard_etsy_traffic_observations").get() as {n:number}).n).toBe(1)
      expect(trafficSnapshot(db,"7d",new Date("2026-10-31T12:00:00Z")).observation).toBeNull()
    } finally {db.close()}
  })
  it("rejects impossible or non-integer values",()=>{
    const db=openAutomationDatabase(":memory:")
    try {
      expect(()=>saveTrafficObservation(db,"30d",{visits:5,socialVisits:6})).toThrow()
      expect(()=>saveTrafficObservation(db,"30d",{visits:5,pinterestVisits:3,socialVisits:2})).toThrow()
      expect(()=>saveTrafficObservation(db,"30d",{visits:1.5})).toThrow()
    } finally {db.close()}
  })
})
