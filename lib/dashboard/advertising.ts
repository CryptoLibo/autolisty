import type Database from "better-sqlite3"
import type { DashboardPeriod } from "./overview"

type SpendRow = { currency: string; channel: string; amountMinor: number; source: string }

export function advertisingSnapshot(db: Database.Database, period: DashboardPeriod, now = new Date()) {
  const days = Number.parseInt(period, 10)
  const to = now.toISOString().slice(0, 10)
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days + 1)).toISOString().slice(0, 10)
  const csv = db.prepare(`SELECT currency, SUM(ABS(net_minor)) AS amountMinor FROM finance_csv_rows
    WHERE status='active' AND classification='marketing' AND net_minor < 0 AND occurred_on BETWEEN ? AND ?
    GROUP BY currency`).all(from,to) as Array<{currency:string;amountMinor:number}>
  const manual = db.prepare(`SELECT e.currency,e.category, SUM(e.amount_minor) AS amountMinor FROM finance_expenses e
    WHERE e.status='active' AND e.category IN ('etsy_ads','pinterest_ads') AND e.occurred_on BETWEEN ? AND ?
      AND NOT EXISTS (SELECT 1 FROM finance_reconciliations r WHERE r.expense_id=e.id)
    GROUP BY e.currency,e.category`).all(from,to) as Array<{currency:string;category:string;amountMinor:number}>
  const spend: SpendRow[] = [
    ...csv.map(row => ({currency:row.currency,channel:"unallocated",amountMinor:row.amountMinor,source:"etsy_statement_csv"})),
    ...manual.map(row => ({currency:row.currency,channel:row.category,amountMinor:row.amountMinor,source:"manual_unreconciled"})),
  ]
  return { period,from,to,spend,coverage:"partial" as const,
    limitations:{campaignMetrics:false,attributedSales:false,roas:false},
    note:"Los cargos Marketing del extracto no identifican la campaña. Un gasto manual conciliado se excluye para evitar duplicación." }
}
