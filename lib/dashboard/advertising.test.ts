import { describe, expect, it } from "vitest"
import { openAutomationDatabase } from "../automation/db/database"
import { advertisingSnapshot } from "./advertising"

describe("advertising snapshot", () => {
  it("separates statement marketing from categorized manual spend and excludes reconciled duplicates", () => {
    const db=openAutomationDatabase(":memory:")
    try {
      db.prepare(`INSERT INTO finance_csv_rows(id,fingerprint,occurred_on,type,currency,net_minor,classification,status,created_at)
        VALUES ('r1','f1','2026-10-30','Marketing','EUR',-500,'marketing','active','2026-10-30'),
        ('r2','f2','2026-10-30','Marketing','EUR',-100,'marketing','reverted','2026-10-30')`).run()
      db.prepare(`INSERT INTO finance_expenses(id,description,category,kind,amount_minor,currency,occurred_on,status,revision,created_at,updated_at)
        VALUES ('e1','Ads','etsy_ads','variable',500,'EUR','2026-10-30','active',1,'2026-10-30','2026-10-30'),
        ('e2','Pins','pinterest_ads','variable',300,'EUR','2026-10-30','active',1,'2026-10-30','2026-10-30')`).run()
      db.prepare("INSERT INTO finance_reconciliations(id,expense_id,csv_row_id,created_at) VALUES ('c1','e1','r1','2026-10-30')").run()
      const result=advertisingSnapshot(db,"7d",new Date("2026-10-30T12:00:00Z"))
      expect(result.spend).toEqual([
        {currency:"EUR",channel:"unallocated",amountMinor:500,source:"etsy_statement_csv"},
        {currency:"EUR",channel:"pinterest_ads",amountMinor:300,source:"manual_unreconciled"},
      ])
      expect(result.limitations.roas).toBe(false)
    } finally {db.close()}
  })
})
