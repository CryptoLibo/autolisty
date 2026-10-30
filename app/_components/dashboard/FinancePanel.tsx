"use client"

import { useEffect, useMemo, useState } from "react"
import { CircleAlert, FileUp, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react"
import type { DashboardPeriod } from "@/lib/dashboard/overview"
import type { ExpenseCategory, ExpenseInput } from "@/lib/dashboard/finance"
import { MetricTile, SectionHeading } from "./DashboardPrimitives"
import { DollarSign, ReceiptText, Wallet } from "lucide-react"

type Expense = ExpenseInput & { id: string; amount_minor: number; occurred_on: string; revision: number; reconciliation_id: string | null }
type Row = { id: string; occurred_on: string; type: string; currency: string; net_minor: number | null; classification: string }
type Import = { id: string; filename: string; row_count: number; status: string; created_at: string }
type Snapshot = { totals: Record<string,{ sales: number; fees: number; marketing: number; tax: number; refunds: number; manual: number; pending: number }>;
  expenses: Expense[]; rows: Row[]; imports: Import[]; reconciliations: Array<{ id: string; expense_id: string; csv_row_id: string }>;
  byCategory: Array<{currency:string;category:string;amount:number}>; byDay: Array<{occurred_on:string;currency:string;sales:number;deductions:number}>; message: string }
type Preview = { fileHash: string; total: number; accepted: number; rejected: Array<{line:number;reason:string}>; breakdown: Array<{type:string;count:number}> }
const labels: Record<ExpenseCategory,string> = { etsy_ads: "Etsy Ads", pinterest_ads: "Pinterest Ads", production: "Producción", ai_tools: "Herramientas de IA",
  software: "Software", hosting: "Hosting", domains: "Dominios", storage: "Almacenamiento", materials: "Materiales", other: "Otros" }
const EXPENSE_CATEGORIES = Object.keys(labels) as ExpenseCategory[]
const empty: ExpenseInput = { description: "", category: "software", kind: "variable", amount: "", currency: "EUR", occurredOn: new Date().toISOString().slice(0,10) }
const inputClass = "min-w-0 w-full rounded border border-white/15 bg-[#182229] px-3 py-2 text-sm text-neutral-100 outline-none focus:border-[#eeba2b]"
function money(minor: number, code: string) { return new Intl.NumberFormat("es-ES", { style: "currency", currency: code }).format(minor / 100) }

export function FinancePanel({ period }: { period: DashboardPeriod }) {
  const [data,setData] = useState<Snapshot | null>(null)
  const [error,setError] = useState("")
  const [busy,setBusy] = useState(false)
  const [reload,setReload] = useState(0)
  const [form,setForm] = useState<ExpenseInput>(empty)
  const [editing,setEditing] = useState<{id:string;revision:number} | null>(null)
  const [category,setCategory] = useState("")
  const [provider,setProvider] = useState("")
  const [search,setSearch] = useState("")
  const [csv,setCsv] = useState<{content:string;filename:string} | null>(null)
  const [preview,setPreview] = useState<Preview | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({period,category,provider})
    void fetch(`/api/dashboard/finance?${params}`,{signal:controller.signal,cache:"no-store"})
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body as Snapshot })
      .then(setData).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "No se pudo leer Finanzas.") })
    return () => controller.abort()
  },[period,category,provider,reload])
  const execute = async (url:string,method:string,body?:unknown) => {
    setBusy(true);setError("")
    try { const response = await fetch(url,{method,headers:{"Content-Type":"application/json"},body:body ? JSON.stringify(body) : undefined})
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "La operación falló.")
      setReload(value=>value+1);return result
    } catch (reason) { setError(reason instanceof Error ? reason.message : "La operación falló.");return null }
    finally { setBusy(false) }
  }
  const submitExpense = async (event:React.FormEvent) => {
    event.preventDefault()
    const result = await execute(editing ? `/api/dashboard/finance/expenses/${editing.id}` : "/api/dashboard/finance",
      editing ? "PUT" : "POST",editing ? {...form,revision:editing.revision} : form)
    if (result) { setForm({...empty,occurredOn:new Date().toISOString().slice(0,10)});setEditing(null) }
  }
  const chooseFile = async (file?:File) => {
    if (!file) return
    if (file.size > 2_000_000 || !file.name.toLowerCase().endsWith(".csv")) { setError("Selecciona un CSV de hasta 2 MB."); return }
    const content = await file.text()
    setCsv({content,filename:file.name});setPreview(null)
    const result = await execute("/api/dashboard/finance/imports","POST",{content,filename:file.name}) as Preview | null
    if (result) setPreview(result)
  }
  const totals = Object.entries(data?.totals ?? {})
  const filteredRows = useMemo(() => (data?.rows ?? []).filter(row => `${row.type} ${row.occurred_on} ${row.classification}`.toLowerCase().includes(search.toLowerCase())),[data,search])
  return <div className="space-y-8">
    <SectionHeading eyebrow="FINANZAS / FUENTES VERIFICABLES" title="Gastos y rentabilidad" description="Movimientos del estado mensual y gastos externos. Los pedidos de la API no se suman de nuevo." />
    {error && <p role="alert" className="flex gap-2 border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200"><CircleAlert size={17}/>{error}</p>}
    <p className="border-l-2 border-[#eeba2b] bg-[#eeba2b]/8 px-4 py-3 text-sm text-amber-100">{data?.message ?? "Cargando movimientos financieros..."}</p>
    {totals.length ? totals.map(([code,total]) => <section key={code} className="space-y-3 border-t border-white/10 pt-5">
      <h3 className="text-sm font-semibold">{code} <span className="font-normal text-neutral-500">Sin conversión de moneda</span></h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile label="Ventas en estado" value={money(total.sales,code)} context="Movimientos Sale del CSV; no depósitos" icon={DollarSign}/>
        <MetricTile label="Comisiones Etsy" value={money(-total.fees,code)} context="Movimientos Fee del CSV" icon={ReceiptText}/>
        <MetricTile label="Marketing Etsy" value={money(-total.marketing,code)} context="Movimientos Marketing del CSV" icon={ReceiptText}/>
        <MetricTile label="Gastos manuales" value={money(total.manual,code)} context="Excluye gastos conciliados" icon={Wallet}/>
      </div>
      <p className="text-xs text-neutral-400">Impuestos/VAT: {money(-total.tax,code)} · Reembolsos: {money(-total.refunds,code)} · Movimientos sin clasificar: {total.pending}.
        Resultado parcial de movimientos conocidos: <strong className="text-neutral-100">{money(total.sales+total.fees+total.marketing+total.tax+total.refunds-total.manual,code)}</strong>. Cobertura no verificada.</p>
    </section>) : <p className="text-sm text-neutral-400">Sin movimientos financieros en este período. Aún no se puede calcular un resultado.</p>}
    {data && <div className="grid gap-8 lg:grid-cols-2">
      <section className="border-t border-white/10 pt-5"><SectionHeading eyebrow="GASTOS EXTERNOS" title="Por categoría"/>
        <div className="mt-4 space-y-3">{data.byCategory.length ? data.byCategory.map(item => {
          const max = Math.max(...data.byCategory.filter(entry=>entry.currency===item.currency).map(entry=>entry.amount))
          return <div key={`${item.currency}:${item.category}`} className="text-xs"><div className="mb-1 flex justify-between gap-2"><span>{labels[item.category as ExpenseCategory] ?? item.category} · {item.currency}</span><span>{money(item.amount,item.currency)}</span></div><div className="h-2 bg-white/8"><div className="h-full bg-[#eeba2b]" style={{width:`${Math.round(item.amount/max*100)}%`}}/></div></div>
        }) : <p className="text-sm text-neutral-500">Sin gastos manuales en el período.</p>}</div>
      </section>
      <section className="border-t border-white/10 pt-5"><SectionHeading eyebrow="MOVIMIENTOS ETSY" title="Evolución diaria"/>
        <div className="mt-4 max-h-64 space-y-2 overflow-auto">{data.byDay.length ? data.byDay.map(item=><div key={`${item.currency}:${item.occurred_on}`} className="grid grid-cols-[90px_1fr_1fr] gap-3 border-b border-white/8 py-2 text-xs"><span className="text-neutral-400">{item.occurred_on}</span><span className="text-emerald-300">Ventas {money(item.sales,item.currency)}</span><span className="text-amber-300">Deducciones {money(-item.deductions,item.currency)}</span></div>) : <p className="text-sm text-neutral-500">Sin movimientos importados en el período.</p>}</div>
      </section>
    </div>}
    <section className="border-t border-white/10 pt-5">
      <SectionHeading eyebrow="REGISTRO EXTERNO" title="Gastos manuales" action={<button type="button" onClick={()=>{setEditing(null);setForm(empty)}} className="inline-flex items-center gap-1 text-xs text-amber-300"><Plus size={14}/> Nuevo</button>}/>
      <form onSubmit={submitExpense} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input required maxLength={160} placeholder="Descripción" aria-label="Descripción" className={inputClass} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/>
        <select aria-label="Categoría" className={inputClass} value={form.category} onChange={e=>setForm({...form,category:e.target.value as ExpenseCategory})}>{EXPENSE_CATEGORIES.map(item=><option key={item} value={item}>{labels[item]}</option>)}</select>
        <input required inputMode="decimal" placeholder="Importe, p. ej. 12.50" aria-label="Importe" className={inputClass} value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/>
        <select aria-label="Moneda" className={inputClass} value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>{["EUR","USD","GBP"].map(code=><option key={code}>{code}</option>)}</select>
        <input required type="date" aria-label="Fecha" className={inputClass} value={form.occurredOn} onChange={e=>setForm({...form,occurredOn:e.target.value})}/>
        <select aria-label="Tipo" className={inputClass} value={form.kind} onChange={e=>setForm({...form,kind:e.target.value as ExpenseInput["kind"],cadence:e.target.value==="fixed"?form.cadence:undefined})}><option value="fixed">Fijo</option><option value="variable">Variable</option><option value="extraordinary">Extraordinario</option></select>
        <input placeholder="Proveedor" aria-label="Proveedor" className={inputClass} value={form.provider ?? ""} onChange={e=>setForm({...form,provider:e.target.value})}/>
        <input placeholder="Referencia" aria-label="Referencia" className={inputClass} value={form.reference ?? ""} onChange={e=>setForm({...form,reference:e.target.value})}/>
        {form.kind==="fixed" && <input placeholder="Periodicidad (informativa)" aria-label="Periodicidad" className={inputClass} value={form.cadence ?? ""} onChange={e=>setForm({...form,cadence:e.target.value})}/>}
        <input placeholder="Notas" aria-label="Notas" className={inputClass} value={form.notes ?? ""} onChange={e=>setForm({...form,notes:e.target.value})}/>
        <button disabled={busy} className="rounded bg-[#eeba2b] px-3 py-2 text-sm font-semibold text-[#16130a] disabled:opacity-50">{editing?"Guardar cambios":"Registrar gasto"}</button>
      </form>
      <div className="mt-5 grid gap-2 sm:grid-cols-2"><select aria-label="Filtrar categoría" className={inputClass} value={category} onChange={e=>setCategory(e.target.value)}><option value="">Todas las categorías</option>{EXPENSE_CATEGORIES.map(item=><option key={item} value={item}>{labels[item]}</option>)}</select><input placeholder="Filtrar proveedor" aria-label="Filtrar proveedor" className={inputClass} value={provider} onChange={e=>setProvider(e.target.value)}/></div>
      <div className="mt-3 divide-y divide-white/10 border-y border-white/10">{data?.expenses.map(expense=>{
        const match = data.rows.find(row=>row.occurred_on===expense.occurred_on && row.currency===expense.currency && row.net_minor===-expense.amount_minor && row.classification!=="sale")
        const relation = data.reconciliations.find(item=>item.expense_id===expense.id)
        return <div key={expense.id} className="flex flex-wrap items-center gap-3 py-3 text-sm"><span className="min-w-0 flex-1"><strong>{expense.description}</strong><span className="ml-2 text-xs text-neutral-400">{expense.occurred_on} · {labels[expense.category]} · {expense.provider || "Sin proveedor"}{expense.reconciliation_id ? " · Conciliado" : ""}</span></span><b>{money(expense.amount_minor,expense.currency)}</b>
          {relation ? <button type="button" disabled={busy} onClick={()=>void execute("/api/dashboard/finance/reconciliations","DELETE",{id:relation.id})} className="text-xs text-amber-300">Deshacer conciliación</button> : match && <button type="button" disabled={busy} onClick={()=>{if(window.confirm(`¿Confirmas que este gasto es el mismo movimiento ${match.type} del CSV?`)) void execute("/api/dashboard/finance/reconciliations","POST",{expenseId:expense.id,rowId:match.id})}} className="text-xs text-amber-300">Conciliar con {match.type}</button>}
          <button type="button" title="Editar gasto" onClick={()=>{setEditing({id:expense.id,revision:expense.revision});setForm({description:expense.description,category:expense.category,kind:expense.kind,amount:String(expense.amount_minor/100),currency:expense.currency,occurredOn:expense.occurred_on,provider:expense.provider,reference:expense.reference,notes:expense.notes,cadence:expense.cadence})}} className="text-amber-300">Editar</button><button type="button" title="Anular gasto" onClick={()=>{if(window.confirm("¿Anular este gasto? Se conservará el historial.")) void execute(`/api/dashboard/finance/expenses/${expense.id}`,"DELETE",{revision:expense.revision})}} className="text-neutral-400"><Trash2 size={15}/></button></div>
      })}</div>
    </section>
    <section className="border-t border-white/10 pt-5"><SectionHeading eyebrow="ETSY / ESTADO MENSUAL" title="Importar movimientos" description="Solo el CSV mensual de nueve columnas validado. No modifica pedidos ni Etsy."/>
      <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded border border-white/20 px-3 py-2 text-sm text-neutral-200"><FileUp size={16}/> Seleccionar CSV<input type="file" accept=".csv,text/csv" className="sr-only" onChange={e=>void chooseFile(e.target.files?.[0])}/></label>
      {preview && <div className="mt-3 border border-white/15 p-4 text-sm"><p>{csv?.filename}: {preview.accepted} de {preview.total} movimientos válidos.</p><p className="mt-2 text-xs text-neutral-400">{preview.breakdown.map(item=>`${item.type}: ${item.count}`).join(" · ")}</p>{preview.rejected.map(item=><p key={item.line} className="text-rose-300">Línea {item.line}: {item.reason}</p>)}<div className="mt-3 flex gap-3"><button type="button" disabled={busy||preview.rejected.length>0} onClick={async()=>{if(csv && await execute("/api/dashboard/finance/imports","POST",{...csv,expectedHash:preview.fileHash})) {setPreview(null);setCsv(null)}}} className="rounded bg-[#eeba2b] px-3 py-2 font-semibold text-[#16130a] disabled:opacity-40">Confirmar importación</button><button type="button" onClick={()=>{setPreview(null);setCsv(null)}} className="text-neutral-400">Cancelar</button></div></div>}
      <div className="mt-5 divide-y divide-white/10">{data?.imports.map(item=><div key={item.id} className="flex flex-wrap items-center gap-3 py-2 text-xs"><span className="flex-1">{item.filename} · {item.row_count} filas · {item.created_at.slice(0,10)} · {item.status}</span>{item.status==="active" && <button type="button" title="Revertir importación" onClick={()=>{if(window.confirm("¿Revertir esta importación? Los movimientos compartidos permanecerán.")) void execute(`/api/dashboard/finance/imports/${item.id}`,"DELETE")}} className="inline-flex gap-1 text-amber-300"><RotateCcw size={14}/> Revertir</button>}</div>)}</div>
    </section>
    <section className="border-t border-white/10 pt-5"><SectionHeading eyebrow="TRAZABILIDAD" title="Movimientos" action={<button type="button" onClick={()=>setReload(v=>v+1)} className="text-neutral-400" title="Actualizar movimientos"><RefreshCw size={16}/></button>}/><input placeholder="Buscar tipo o fecha" aria-label="Buscar movimientos" className={`${inputClass} mt-4 max-w-sm`} value={search} onChange={e=>setSearch(e.target.value)}/><div className="mt-3 max-h-96 overflow-auto divide-y divide-white/10 border-y border-white/10">{filteredRows.map(row=><div key={row.id} className="flex flex-wrap items-center gap-3 py-2 text-xs"><span className="w-24 text-neutral-400">{row.occurred_on}</span><span className="w-24">{row.type}</span><span className="flex-1 text-neutral-400">{row.classification==="pending"?"Pendiente de clasificación":row.classification}</span><strong>{row.net_minor==null?"--":money(row.net_minor,row.currency)}</strong></div>)}</div><p className="mt-2 text-xs text-neutral-500">Depósitos y pagos sin clasificación no incrementan las ventas. La conciliación manual se hace solo con movimientos exactos de mismo día, moneda e importe.</p></section>
  </div>
}
