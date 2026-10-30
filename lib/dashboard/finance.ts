import { createHash, randomUUID } from "node:crypto"
import type Database from "better-sqlite3"
import { parse } from "csv-parse/sync"

export const EXPENSE_CATEGORIES = ["etsy_ads", "pinterest_ads", "production", "ai_tools", "software", "hosting", "domains", "storage", "materials", "other"] as const
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number]
export const FINANCE_PERIODS = ["7d", "30d", "90d"] as const
export type FinancePeriod = typeof FINANCE_PERIODS[number]
const HEADER = ["Date", "Type", "Title", "Info", "Currency", "Amount", "Fees & Taxes", "Net", "Tax Details"]
const CURRENCIES = new Set(["EUR", "USD", "GBP"])
const TYPES = new Set(["Deposit", "Fee", "Marketing", "Payment", "Sale", "Tax", "VAT", "Refund", "Adjustment"])

export class FinanceValidationError extends Error {}

function hash(value: string) { return createHash("sha256").update(value).digest("hex") }
function dateOnly(value: string) {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new FinanceValidationError("Fecha no válida. Usa AAAA-MM-DD.")
  }
  return value
}
export function parseAmount(value: string) {
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value)) throw new FinanceValidationError("Importe no válido; usa dos decimales como máximo.")
  const [whole, fraction = ""] = value.split(".")
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
  if (!Number.isSafeInteger(minor) || minor <= 0) throw new FinanceValidationError("El importe debe ser positivo y seguro.")
  return minor
}
function currency(value: string) {
  if (!CURRENCIES.has(value)) throw new FinanceValidationError("Moneda no admitida. Se admiten EUR, USD y GBP.")
  return value
}
function limited(value: unknown, max: number, required = false) {
  if (typeof value !== "string") throw new FinanceValidationError("Campo de texto no válido.")
  const clean = value.trim()
  if ((required && !clean) || clean.length > max) throw new FinanceValidationError("Campo de texto vacío o demasiado largo.")
  return clean
}
export type ExpenseInput = { description: string; category: ExpenseCategory; kind: "fixed" | "variable" | "extraordinary";
  cadence?: string; amount: string; currency: string; occurredOn: string; provider?: string; reference?: string; notes?: string }
function validateExpense(input: ExpenseInput) {
  if (!EXPENSE_CATEGORIES.includes(input.category) || !["fixed", "variable", "extraordinary"].includes(input.kind)) {
    throw new FinanceValidationError("Categoría o tipo de gasto no válido.")
  }
  const cadence = limited(input.cadence ?? "", 40)
  if (cadence && input.kind !== "fixed") throw new FinanceValidationError("La periodicidad solo corresponde a gastos fijos.")
  return { description: limited(input.description, 160, true), category: input.category, kind: input.kind, cadence: cadence || null,
    amount_minor: parseAmount(input.amount), currency: currency(input.currency), occurred_on: dateOnly(input.occurredOn),
    provider: limited(input.provider ?? "", 100) || null, reference: limited(input.reference ?? "", 100) || null,
    notes: limited(input.notes ?? "", 500) || null }
}
export function createExpense(db: Database.Database, input: ExpenseInput) {
  const data = validateExpense(input); const id = randomUUID(); const now = new Date().toISOString()
  db.transaction(() => {
    db.prepare(`INSERT INTO finance_expenses (id,description,category,kind,cadence,amount_minor,currency,occurred_on,provider,reference,notes,status,revision,created_at,updated_at)
      VALUES (@id,@description,@category,@kind,@cadence,@amount_minor,@currency,@occurred_on,@provider,@reference,@notes,'active',1,@now,@now)`).run({ ...data, id, now })
    db.prepare("INSERT INTO finance_expense_events (id,expense_id,action,before_json,after_json,occurred_at) VALUES (?,?,'created',NULL,?,?)")
      .run(randomUUID(), id, JSON.stringify(data), now)
  })()
  return id
}
export function updateExpense(db: Database.Database, id: string, input: ExpenseInput, revision: number) {
  const data = validateExpense(input); const now = new Date().toISOString()
  return db.transaction(() => {
    const before = db.prepare("SELECT * FROM finance_expenses WHERE id=? AND status='active'").get(id) as Record<string, unknown> | undefined
    if (!before || before.revision !== revision) throw new FinanceValidationError("Gasto inexistente o modificado por otra sesión.")
    if (db.prepare("SELECT 1 FROM finance_reconciliations WHERE expense_id=?").get(id)) {
      throw new FinanceValidationError("Deshaz la conciliación antes de editar el gasto.")
    }
    db.prepare(`UPDATE finance_expenses SET description=@description,category=@category,kind=@kind,cadence=@cadence,amount_minor=@amount_minor,
      currency=@currency,occurred_on=@occurred_on,provider=@provider,reference=@reference,notes=@notes,revision=revision+1,updated_at=@now WHERE id=@id`)
      .run({ ...data, id, now })
    db.prepare("INSERT INTO finance_expense_events (id,expense_id,action,before_json,after_json,occurred_at) VALUES (?,?,'updated',?,?,?)")
      .run(randomUUID(), id, JSON.stringify(before), JSON.stringify(data), now)
    return revision + 1
  })()
}
export function voidExpense(db: Database.Database, id: string, revision: number) {
  const now = new Date().toISOString()
  db.transaction(() => {
    const before = db.prepare("SELECT * FROM finance_expenses WHERE id=? AND status='active'").get(id) as Record<string, unknown> | undefined
    if (!before || before.revision !== revision) throw new FinanceValidationError("Gasto inexistente o modificado por otra sesión.")
    if (db.prepare("SELECT 1 FROM finance_reconciliations WHERE expense_id=?").get(id)) {
      throw new FinanceValidationError("Deshaz la conciliación antes de anular el gasto.")
    }
    db.prepare("UPDATE finance_expenses SET status='void',revision=revision+1,updated_at=?,voided_at=? WHERE id=?").run(now, now, id)
    db.prepare("INSERT INTO finance_expense_events (id,expense_id,action,before_json,after_json,occurred_at) VALUES (?,?,'voided',?,NULL,?)")
      .run(randomUUID(), id, JSON.stringify(before), now)
  })()
}

type CsvRow = { occurredOn: string; type: string; currency: string; amountMinor: number | null; feesMinor: number | null;
  netMinor: number | null; classification: string; fingerprint: string }
function csvMoney(raw: string, code: string) {
  if (raw === "--" || raw === "") return null
  const symbol = { EUR: "€", USD: "$", GBP: "£" }[code as "EUR" | "USD" | "GBP"]
  const match = /^(-)?([€$£])([0-9]+)(?:[.,]([0-9]{2}))?$/.exec(raw.trim())
  if (!match || match[2] !== symbol) throw new FinanceValidationError("Importe CSV no válido o símbolo distinto de la moneda.")
  const amount = Number(match[3]) * 100 + Number(match[4] ?? "00")
  if (!Number.isSafeInteger(amount)) throw new FinanceValidationError("Importe CSV fuera de rango.")
  return match[1] ? -amount : amount
}
export function previewStatement(content: string) {
  if (Buffer.byteLength(content, "utf8") > 2_000_000) throw new FinanceValidationError("CSV mayor que 2 MB.")
  let rows: string[][]
  try { rows = parse(content.replace(/^\uFEFF/, ""), { bom: true, skip_empty_lines: true, relax_quotes: false }) as string[][] }
  catch { throw new FinanceValidationError("CSV mal formado.") }
  if (!rows.length || rows[0].length !== HEADER.length || rows[0].some((name, index) => name !== HEADER[index])) {
    throw new FinanceValidationError("Formato no compatible. Se requiere el estado mensual de Etsy con nueve columnas conocidas.")
  }
  if (rows.length > 5001) throw new FinanceValidationError("CSV con más de 5000 movimientos.")
  const occurrences = new Map<string, number>()
  const accepted: CsvRow[] = []; const rejected: Array<{ line: number; reason: string }> = []
  for (let index = 1; index < rows.length; index++) {
    const fields = rows[index]
    try {
      if (fields.length !== HEADER.length) throw new FinanceValidationError("Número de columnas incorrecto.")
      const [date, type, , , code, amount, fees, net] = fields
      if (!TYPES.has(type)) throw new FinanceValidationError("Tipo de movimiento no reconocido.")
      currency(code)
      const parsedDate = new Date(`${date} 00:00:00 GMT`)
      if (!/^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(date) || Number.isNaN(parsedDate.getTime()) ||
        new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" }).format(parsedDate) !== date) {
        throw new FinanceValidationError("Fecha CSV no válida.")
      }
      const amountMinor = csvMoney(amount, code); const feesMinor = csvMoney(fees, code); const netMinor = csvMoney(net, code)
      if (type !== "Deposit" && (netMinor === null || (amountMinor ?? 0) + (feesMinor ?? 0) !== netMinor)) {
        throw new FinanceValidationError("El neto no coincide con importe más comisiones/impuestos.")
      }
      const canonical = JSON.stringify(fields)
      const count = (occurrences.get(canonical) ?? 0) + 1; occurrences.set(canonical, count)
      const classification = type === "Sale" ? "sale" : type === "Fee" ? "fee" : type === "Marketing" ? "marketing" :
        type === "Tax" || type === "VAT" ? "tax" : type === "Refund" ? "refund" : "pending"
      accepted.push({ occurredOn: parsedDate.toISOString().slice(0, 10), type, currency: code,
        amountMinor, feesMinor, netMinor, classification, fingerprint: hash(`${canonical}:${count}`) })
    } catch (error) { rejected.push({ line: index + 1, reason: error instanceof Error ? error.message : "Fila inválida." }) }
  }
  return { fileHash: hash(content), total: rows.length - 1, accepted, rejected }
}
export function importStatement(db: Database.Database, content: string, filename: string, expectedHash: string) {
  const preview = previewStatement(content)
  if (preview.fileHash !== expectedHash) throw new FinanceValidationError("El archivo cambió después de la vista previa.")
  if (preview.rejected.length) throw new FinanceValidationError("Corrige las filas rechazadas antes de confirmar; no se importó nada.")
  const safeName = limited(filename, 120, true).replace(/[\\/]/g, "_")
  const now = new Date().toISOString()
  return db.transaction(() => {
    const existing = db.prepare("SELECT id,status FROM finance_csv_imports WHERE file_hash=?").get(preview.fileHash) as { id: string; status: string } | undefined
    if (existing?.status === "active") return { id: existing.id, inserted: 0, duplicate: true }
    const id = existing?.id ?? randomUUID()
    if (existing) db.prepare("UPDATE finance_csv_imports SET status='active',reverted_at=NULL,created_at=? WHERE id=?").run(now, id)
    else db.prepare(`INSERT INTO finance_csv_imports (id,file_hash,filename,row_count,accepted_count,rejected_count,status,created_at)
      VALUES (?,?,?,?,?,0,'active',?)`).run(id, preview.fileHash, safeName, preview.total, preview.accepted.length, now)
    let inserted = 0
    for (const row of preview.accepted) {
      let found = db.prepare("SELECT id,status FROM finance_csv_rows WHERE fingerprint=?").get(row.fingerprint) as { id: string; status: string } | undefined
      if (!found) {
        const rowId = randomUUID()
        db.prepare(`INSERT INTO finance_csv_rows (id,fingerprint,occurred_on,type,currency,amount_minor,fees_minor,net_minor,classification,status,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,'active',?)`).run(rowId,row.fingerprint,row.occurredOn,row.type,row.currency,row.amountMinor,row.feesMinor,row.netMinor,row.classification,now)
        found = { id: rowId, status: "active" }; inserted++
      } else if (found.status === "reverted") db.prepare("UPDATE finance_csv_rows SET status='active' WHERE id=?").run(found.id)
      db.prepare("INSERT OR IGNORE INTO finance_csv_import_rows (import_id,row_id) VALUES (?,?)").run(id,found.id)
    }
    return { id, inserted, duplicate: false }
  })()
}
export function revertStatement(db: Database.Database, id: string) {
  db.transaction(() => {
    const entry = db.prepare("SELECT status FROM finance_csv_imports WHERE id=?").get(id) as { status: string } | undefined
    if (!entry || entry.status !== "active") throw new FinanceValidationError("Importación inexistente o ya revertida.")
    const linked = db.prepare(`SELECT COUNT(*) AS count FROM finance_reconciliations WHERE csv_row_id IN
      (SELECT row_id FROM finance_csv_import_rows WHERE import_id=?)`).get(id) as { count: number }
    if (linked.count) throw new FinanceValidationError("La importación tiene conciliaciones; retíralas antes de revertir.")
    db.prepare("DELETE FROM finance_csv_import_rows WHERE import_id=?").run(id)
    db.prepare(`UPDATE finance_csv_rows SET status='reverted' WHERE id NOT IN
      (SELECT ir.row_id FROM finance_csv_import_rows ir JOIN finance_csv_imports i ON i.id=ir.import_id WHERE i.status='active')`).run()
    db.prepare("UPDATE finance_csv_imports SET status='reverted',reverted_at=? WHERE id=?").run(new Date().toISOString(),id)
  })()
}

export function reconcileExpense(db: Database.Database, expenseId: string, rowId: string) {
  const expense = db.prepare("SELECT id,currency,amount_minor,occurred_on,status FROM finance_expenses WHERE id=?").get(expenseId) as
    { id: string; currency: string; amount_minor: number; occurred_on: string; status: string } | undefined
  const row = db.prepare("SELECT id,currency,net_minor,occurred_on,status,classification FROM finance_csv_rows WHERE id=?").get(rowId) as
    { id: string; currency: string; net_minor: number | null; occurred_on: string; status: string; classification: string } | undefined
  if (!expense || !row || expense.status !== "active" || row.status !== "active" ||
    expense.currency !== row.currency || row.net_minor === null || row.net_minor >= 0 ||
    row.classification === "sale" || Math.abs(row.net_minor) !== expense.amount_minor || expense.occurred_on !== row.occurred_on) {
    throw new FinanceValidationError("Conciliación no válida: exige mismo día, moneda e importe y un movimiento de gasto confirmado.")
  }
  const existing = db.prepare("SELECT id FROM finance_reconciliations WHERE expense_id=? OR csv_row_id=?").get(expenseId,rowId)
  if (existing) throw new FinanceValidationError("Este gasto ya está conciliado.")
  db.prepare("INSERT INTO finance_reconciliations (id,expense_id,csv_row_id,created_at) VALUES (?,?,?,?)")
    .run(randomUUID(),expenseId,rowId,new Date().toISOString())
}
export function undoReconciliation(db: Database.Database, id: string) {
  const result = db.prepare("DELETE FROM finance_reconciliations WHERE id=?").run(id)
  if (!result.changes) throw new FinanceValidationError("Conciliación inexistente.")
}

export function financeSnapshot(db: Database.Database, period: FinancePeriod, category?: string, provider?: string) {
  const since = new Date(Date.now() - (Number(period.slice(0, -1)) - 1) * 86400000).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  const expenses = db.prepare(`SELECT e.*,r.id AS reconciliation_id,r.csv_row_id FROM finance_expenses e
    LEFT JOIN finance_reconciliations r ON r.expense_id=e.id
    WHERE e.status='active' AND e.occurred_on BETWEEN ? AND ? AND (?='' OR e.category=?) AND (?='' OR e.provider LIKE ?)
    ORDER BY e.occurred_on DESC,e.created_at DESC LIMIT 500`).all(since,today,category ?? "",category ?? "",provider ?? "",`%${provider ?? ""}%`) as Array<Record<string, unknown>>
  const rows = db.prepare(`SELECT id,occurred_on,type,currency,amount_minor,fees_minor,net_minor,classification FROM finance_csv_rows
    WHERE status='active' AND occurred_on BETWEEN ? AND ? ORDER BY occurred_on DESC,id DESC LIMIT 500`).all(since,today) as Array<Record<string, unknown>>
  const imports = db.prepare("SELECT id,filename,row_count,accepted_count,rejected_count,status,created_at,reverted_at FROM finance_csv_imports ORDER BY created_at DESC LIMIT 50").all()
  const reconciliations = db.prepare("SELECT id,expense_id,csv_row_id,created_at FROM finance_reconciliations ORDER BY created_at DESC LIMIT 500").all()
  const totals: Record<string, { sales: number; fees: number; marketing: number; tax: number; refunds: number; manual: number; pending: number }> = {}
  const bucket = (code: string) => totals[code] ??= { sales: 0, fees: 0, marketing: 0, tax: 0, refunds: 0, manual: 0, pending: 0 }
  const aggregates = db.prepare(`SELECT currency,classification,COUNT(*) AS count,SUM(net_minor) AS amount
    FROM finance_csv_rows WHERE status='active' AND occurred_on BETWEEN ? AND ? GROUP BY currency,classification`).all(since,today) as
    Array<{currency:string;classification:string;count:number;amount:number|null}>
  for (const group of aggregates) {
    const total = bucket(group.currency); const value = group.amount ?? 0
    if (group.classification === "sale") total.sales += value
    else if (group.classification === "fee") total.fees += value
    else if (group.classification === "marketing") total.marketing += value
    else if (group.classification === "tax") total.tax += value
    else if (group.classification === "refund") total.refunds += value
    else total.pending += group.count
  }
  const manual = db.prepare(`SELECT e.currency,SUM(e.amount_minor) AS amount FROM finance_expenses e
    WHERE e.status='active' AND e.occurred_on BETWEEN ? AND ? AND NOT EXISTS
      (SELECT 1 FROM finance_reconciliations r WHERE r.expense_id=e.id) GROUP BY e.currency`).all(since,today) as
    Array<{currency:string;amount:number}>
  for (const group of manual) bucket(group.currency).manual = group.amount
  const byCategory = db.prepare(`SELECT currency,category,SUM(amount_minor) AS amount FROM finance_expenses
    WHERE status='active' AND occurred_on BETWEEN ? AND ? AND id NOT IN (SELECT expense_id FROM finance_reconciliations)
    GROUP BY currency,category ORDER BY amount DESC`).all(since,today) as Array<{currency:string;category:string;amount:number}>
  const byDay = db.prepare(`SELECT occurred_on,currency,
    SUM(CASE WHEN classification='sale' THEN COALESCE(net_minor,0) ELSE 0 END) AS sales,
    SUM(CASE WHEN classification IN ('fee','marketing','tax','refund') THEN COALESCE(net_minor,0) ELSE 0 END) AS deductions
    FROM finance_csv_rows WHERE status='active' AND occurred_on BETWEEN ? AND ?
    GROUP BY occurred_on,currency ORDER BY occurred_on`).all(since,today) as Array<{occurred_on:string;currency:string;sales:number;deductions:number}>
  return { period, since, totals, expenses, rows, imports, reconciliations,
    byCategory, byDay,
    coverage: "partial" as const, message: "Resultado parcial: falta verificar cobertura completa de movimientos y gastos. No es beneficio neto ni saldo bancario." }
}
