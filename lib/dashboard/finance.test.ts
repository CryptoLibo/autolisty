import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import Database from "better-sqlite3"
import { openAutomationDatabase } from "../automation/db/database"
import { runAutomationMigrations } from "../automation/db/migrations"
import { createExpense, financeSnapshot, importStatement, parseAmount, previewStatement, reconcileExpense, revertStatement, updateExpense, voidExpense } from "./finance"

const header = 'Date,Type,Title,Info,Currency,Amount,"Fees & Taxes",Net,"Tax Details"'
const statement = [header,
  '"October 30, 2026",Sale,Order 1,,EUR,€10.00,--,€10.00,--',
  '"October 30, 2026",Marketing,Etsy Ads,Ref 1,EUR,--,-€2.00,-€2.00,--',
  '"October 30, 2026",Fee,Listing,Ref 2,EUR,--,-€0.20,-€0.20,--',
  '"October 30, 2026",Deposit,Transfer,,EUR,--,--,--,--',
  '"October 30, 2026",Payment,Adjustment,Ref 3,EUR,--,€4.00,€4.00,--'].join("\n")
const input = { description: "Etsy Ads", category: "etsy_ads" as const, kind: "variable" as const,
  amount: "2.00", currency: "EUR", occurredOn: "2026-10-30" }

describe("finance", () => {
  it("migrates an existing v12 database without touching prior rows", () => {
    const db = new Database(":memory:")
    try {
      expect(runAutomationMigrations(db,12)).toBe(12)
      expect(runAutomationMigrations(db)).toBe(13)
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name='finance_csv_imports'").get()).toBeTruthy()
    } finally { db.close() }
  })
  it.runIf(Boolean(process.env.ETSY_STATEMENT_SAMPLE))("validates the supplied anonymized statement without persisting its private fields", () => {
    const content = readFileSync(process.env.ETSY_STATEMENT_SAMPLE!,"utf8")
    const preview = previewStatement(content)
    expect(preview.total).toBeGreaterThan(0)
    expect(preview.rejected).toEqual([])
  })
  it("validates minor units and currencies", () => {
    expect(parseAmount("12.34")).toBe(1234)
    expect(() => parseAmount("12.345")).toThrow()
    expect(() => parseAmount("-1")).toThrow()
    const db = openAutomationDatabase(":memory:")
    try { expect(() => createExpense(db, { ...input, currency: "JPY" })).toThrow() } finally { db.close() }
  })
  it("keeps audit history across edits and voids", () => {
    const db = openAutomationDatabase(":memory:")
    try {
      const id = createExpense(db,input)
      expect(updateExpense(db,id,{...input,description:"Updated"},1)).toBe(2)
      expect(() => updateExpense(db,id,input,1)).toThrow()
      voidExpense(db,id,2)
      expect((db.prepare("SELECT COUNT(*) AS n FROM finance_expense_events WHERE expense_id=?").get(id) as {n:number}).n).toBe(3)
      expect(financeSnapshot(db,"7d").expenses).toHaveLength(0)
    } finally { db.close() }
  })
  it("previews a monthly statement, rejects malformed rows, and excludes transfer from sales", () => {
    const preview = previewStatement(statement)
    expect(preview.accepted).toHaveLength(5)
    expect(preview.rejected).toHaveLength(0)
    expect(preview.accepted.find(row=>row.type==="Deposit")?.classification).toBe("pending")
    expect(preview.accepted.find(row=>row.type==="Payment")?.classification).toBe("pending")
    expect(previewStatement(statement.replace("€10.00,--,€10.00", "€10.00,--,€11.00")).rejected).toHaveLength(1)
    expect(() => previewStatement("A,B\n1,2")).toThrow()
  })
  it("deduplicates overlapping imports and reverses only unshared rows", () => {
    const db = openAutomationDatabase(":memory:")
    try {
      const first = importStatement(db,statement,"October.csv",previewStatement(statement).fileHash)
      expect(first.inserted).toBe(5)
      expect(importStatement(db,statement,"Again.csv",previewStatement(statement).fileHash).duplicate).toBe(true)
      const overlap = [header,...statement.split("\n").slice(1,3)].join("\n")
      expect(importStatement(db,overlap,"Other.csv",previewStatement(overlap).fileHash).inserted).toBe(0)
      revertStatement(db,first.id)
      expect((db.prepare("SELECT COUNT(*) AS n FROM finance_csv_rows WHERE status='active'").get() as {n:number}).n).toBe(2)
      expect(() => revertStatement(db,first.id)).toThrow()
    } finally { db.close() }
  })
  it("reconciles exact duplicate expense without changing imported movement", () => {
    const db = openAutomationDatabase(":memory:")
    try {
      const imported = importStatement(db,statement,"October.csv",previewStatement(statement).fileHash)
      const expenseId = createExpense(db,input)
      const row = db.prepare("SELECT id FROM finance_csv_rows WHERE type='Marketing'").get() as {id:string}
      reconcileExpense(db,expenseId,row.id)
      expect(() => reconcileExpense(db,expenseId,row.id)).toThrow()
      expect(() => reconcileExpense(db,createExpense(db,input),row.id)).toThrow()
      expect(() => updateExpense(db,expenseId,input,1)).toThrow()
      expect(() => voidExpense(db,expenseId,1)).toThrow()
      expect(() => revertStatement(db,imported.id)).toThrow()
      expect((db.prepare("SELECT COUNT(*) AS n FROM finance_reconciliations").get() as {n:number}).n).toBe(1)
    } finally { db.close() }
  })
})
