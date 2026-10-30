import { describe,expect,it } from "vitest"
import { openAutomationDatabase } from "../automation/db/database"
import { comparableChange,getBusinessIntelligence } from "./intelligence"

const now=new Date("2026-10-30T12:00:00Z")
const access={etsyConnected:true,etsySalesAuthorized:true,pinterestConnected:false,pinterestAuthorized:false}
function seed(db:ReturnType<typeof openAutomationDatabase>) {
  db.prepare(`INSERT INTO dashboard_etsy_sync(shop_id,status,started_at,last_success_at,active_count,draft_count,inactive_count,expired_count,sold_out_count,details_complete)
    VALUES (1,'complete',?,?,1,0,0,1,0,1)`).run(now.toISOString(),now.toISOString())
  db.prepare(`INSERT INTO dashboard_etsy_sales_sync(shop_id,status,started_at,last_success_at,coverage_from,coverage_to,details_complete)
    VALUES (1,'complete',?,?,?, ?,1)`).run(now.toISOString(),now.toISOString(),Math.floor(Date.UTC(2026,0,1)/1000),Math.floor(now.getTime()/1000))
  db.prepare(`INSERT INTO dashboard_etsy_listings(shop_id,listing_id,state,title,synced_at) VALUES
    (1,100,'active','Arte moderno',?),(1,200,'expired','Arte antiguo',?)`).run(now.toISOString(),now.toISOString())
  const receipt=db.prepare(`INSERT INTO dashboard_etsy_receipts(shop_id,receipt_id,status,created_timestamp,currency_code,grand_amount,grand_divisor,transactions_complete)
    VALUES (1,?,'paid',?,'EUR',1000,100,1)`)
  const transaction=db.prepare(`INSERT INTO dashboard_etsy_transactions(shop_id,receipt_id,transaction_id,listing_id,quantity,price_amount,price_divisor,currency_code)
    VALUES (1,?,?,?,1,1000,100,'EUR')`)
  for (let i=1;i<=4;i++) {const date=i===4?"2026-10-25T12:00:00Z":"2026-10-20T12:00:00Z"
    receipt.run(i,Math.floor(Date.parse(date)/1000));transaction.run(i,i,i===4?100:200)}
}
describe("business intelligence",()=>{
  it("does not invent growth from a zero prior base",()=>{
    expect(comparableChange(3,0)).toEqual({difference:3,percent:null,comparison:"no_prior_activity"})
  })
  it("returns partial coverage without data, not a negative business verdict",()=>{
    const db=openAutomationDatabase(":memory:")
    try {const result=getBusinessIntelligence(db,"7d",access,now)
      expect(result.orders).toBeNull()
      expect(result.products).toEqual([])
      expect(result.summary).toContain("Evaluación parcial")
      expect(result.coverage.finance).toBe("not_configured")
    } finally {db.close()}
  })
  it("compares equal periods and prioritizes expired listings with verified sales",()=>{
    const db=openAutomationDatabase(":memory:")
    try {seed(db)
      const result=getBusinessIntelligence(db,"7d",access,now)
      expect(result.orders).toEqual({current:1,previous:3})
      expect(result.change?.percent).toBeCloseTo(-2/3)
      expect(result.orderValue).toEqual({currency:"EUR",current:10,previous:30})
      expect(result.decisions[0].id).toBe("expired_listings")
      expect(result.decisions.some(item=>item.id==="sales_drop")).toBe(true)
      expect(result.decisions[0].title).toContain("historial comercial")
      expect(result.decisions.map(item=>item.id).filter(id=>id==="expired_listings")).toHaveLength(1)
      expect(result.quietProducts).toEqual([])
    } finally {db.close()}
  })
  it("does not mix currencies in order-value comparison",()=>{
    const db=openAutomationDatabase(":memory:")
    try {seed(db)
      db.prepare("UPDATE dashboard_etsy_receipts SET currency_code='USD' WHERE receipt_id=1").run()
      const result=getBusinessIntelligence(db,"7d",access,now)
      expect(result.orderValue).toBeNull()
      expect(result.orders?.current).toBe(1)
    } finally {db.close()}
  })
  it("marks stale sources and avoids sales alerts based on outdated syncs",()=>{
    const db=openAutomationDatabase(":memory:")
    try {seed(db)
      db.prepare("UPDATE dashboard_etsy_sales_sync SET last_success_at='2026-10-20T00:00:00Z'").run()
      const result=getBusinessIntelligence(db,"7d",access,now)
      expect(result.coverage.sales).toBe("stale")
      expect(result.decisions.some(item=>item.id==="sales_drop")).toBe(false)
      expect(result.products).toEqual([])
    } finally {db.close()}
  })
  it("reports active listings without sales only with complete coverage",()=>{
    const db=openAutomationDatabase(":memory:")
    try {seed(db)
      db.prepare("INSERT INTO dashboard_etsy_listings(shop_id,listing_id,state,title,synced_at) VALUES (1,300,'active','Nuevo','2026-10-30')").run()
      expect(getBusinessIntelligence(db,"7d",access,now).quietProducts).toContainEqual({listingId:300,title:"Nuevo"})
      db.prepare("UPDATE dashboard_etsy_sync SET details_complete=0").run()
      expect(getBusinessIntelligence(db,"7d",access,now).quietProducts).toEqual([])
    } finally {db.close()}
  })
  it("does not attribute Pinterest clicks to sales and keeps the top-50 limitation",()=>{
    const db=openAutomationDatabase(":memory:")
    try {seed(db)
      db.prepare(`INSERT INTO dashboard_pinterest_sync(account_id,status,started_at,last_success_at,pins_complete)
        VALUES ('p1','complete',?,?,1)`).run(now.toISOString(),now.toISOString())
      db.prepare(`INSERT INTO dashboard_pinterest_periods(account_id,period,coverage_from,coverage_to,impressions,saves,pin_clicks,outbound_clicks,engagements,fetched_at)
        VALUES ('p1','7d','2026-10-24','2026-10-30',100,2,8,10,12,?)`).run(now.toISOString())
      db.prepare(`INSERT INTO dashboard_pinterest_top_sync(account_id,period,status,fetched_at,coverage_from,coverage_to)
        VALUES ('p1','7d','complete',?,'2026-10-24','2026-10-30')`).run(now.toISOString())
      db.prepare(`INSERT INTO dashboard_pinterest_pins(pin_id,account_id,listing_id,updated_at)
        VALUES ('999','p1',100,?)`).run(now.toISOString())
      db.prepare(`INSERT INTO dashboard_pinterest_top_pins(account_id,period,pin_id,outbound_clicks,impressions,fetched_at)
        VALUES ('p1','7d','999',10,100,?)`).run(now.toISOString())
      const result=getBusinessIntelligence(db,"7d",{...access,pinterestConnected:true,pinterestAuthorized:true},now)
      expect(result.products.find(item=>item.listingId===100)?.pinterestOutbound).toBe(10)
      const opportunity=result.decisions.find(item=>item.id==="pin_interest_100")
      expect(opportunity?.limitation).toContain("No son visitas ni ventas atribuidas")
    } finally {db.close()}
  })
  it("compares registered deductions with the same currency but never calls them profit",()=>{
    const db=openAutomationDatabase(":memory:")
    try {seed(db)
      db.prepare(`INSERT INTO finance_csv_imports(id,file_hash,filename,row_count,accepted_count,rejected_count,status,created_at)
        VALUES ('i1','hash','statement.csv',2,2,0,'active','2026-10-30')`).run()
      db.prepare(`INSERT INTO finance_csv_rows(id,fingerprint,occurred_on,type,currency,net_minor,classification,status,created_at)
        VALUES ('f1','h1','2026-10-20','Fee','EUR',-1000,'fee','active','2026-10-20'),
        ('f2','h2','2026-10-25','Fee','EUR',-2500,'fee','active','2026-10-25')`).run()
      const result=getBusinessIntelligence(db,"7d",access,now)
      expect(result.decisions.find(item=>item.id==="registered_spend_rise")?.limitation).toContain("no representa gastos totales ni beneficio neto")
      expect(result.financialCoverage).toBe("partial")
    } finally {db.close()}
  })
  it("isolates a finance read error from sales and operations",()=>{
    const db=openAutomationDatabase(":memory:")
    try {seed(db)
      db.exec("DROP TABLE finance_csv_imports")
      const result=getBusinessIntelligence(db,"7d",access,now)
      expect(result.coverage.finance).toBe("error")
      expect(result.orders?.current).toBe(1)
      expect(result.coverage.operations).toBe("available")
    } finally {db.close()}
  })
  it("detects a Pinterest decline only with complete daily coverage",()=>{
    const db=openAutomationDatabase(":memory:")
    try {
      db.prepare(`INSERT INTO dashboard_pinterest_sync(account_id,status,started_at,last_success_at,pins_complete)
        VALUES ('p1','complete',?,?,1)`).run(now.toISOString(),now.toISOString())
      db.prepare(`INSERT INTO dashboard_pinterest_periods(account_id,period,coverage_from,coverage_to,impressions,saves,pin_clicks,outbound_clicks,engagements,fetched_at)
        VALUES ('p1','7d','2026-10-24','2026-10-30',21,0,0,0,0,?)`).run(now.toISOString())
      const insert=db.prepare(`INSERT INTO dashboard_pinterest_daily(account_id,day,impressions,outbound_clicks,fetched_at) VALUES ('p1',?,?,0,?)`)
      for(let day=17;day<=30;day++)insert.run(`2026-10-${day}`,day<24?10:3,now.toISOString())
      const credentials={...access,pinterestConnected:true,pinterestAuthorized:true}
      expect(getBusinessIntelligence(db,"7d",credentials,now).decisions.some(item=>item.id==="pinterest_impressions_drop")).toBe(true)
      db.prepare("DELETE FROM dashboard_pinterest_daily WHERE day='2026-10-18'").run()
      expect(getBusinessIntelligence(db,"7d",credentials,now).decisions.some(item=>item.id==="pinterest_impressions_drop")).toBe(false)
    } finally {db.close()}
  })
  it("recognizes product growth without duplicating opportunities",()=>{
    const db=openAutomationDatabase(":memory:")
    try {seed(db)
      db.prepare(`INSERT INTO dashboard_etsy_receipts(shop_id,receipt_id,status,created_timestamp,currency_code,grand_amount,grand_divisor,transactions_complete)
        VALUES (1,5,'paid',?, 'EUR',1000,100,1)`).run(Math.floor(Date.parse("2026-10-26T12:00:00Z")/1000))
      db.prepare(`INSERT INTO dashboard_etsy_transactions(shop_id,receipt_id,transaction_id,listing_id,quantity,price_amount,price_divisor,currency_code)
        VALUES (1,5,5,100,1,1000,100,'EUR')`).run()
      const result=getBusinessIntelligence(db,"7d",access,now)
      expect(result.decisions.filter(item=>item.id==="product_growth_100")).toHaveLength(1)
    } finally {db.close()}
  })
})
