"use client"

import { useState } from "react"
import { ArrowUpRight, CircleAlert, DollarSign, RefreshCw, ShoppingBag, TrendingUp } from "lucide-react"
import type { getSalesSnapshot } from "@/lib/dashboard/etsy-sales"
import { MetricTile, SectionHeading } from "./DashboardPrimitives"

export type Sales = ReturnType<typeof getSalesSnapshot>

function currency(value: number, code: string) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: code }).format(value)
}

function delta(current: number, previous: number) {
  if (!previous) return "Sin base anterior"
  return `${current >= previous ? "+" : ""}${((current - previous) / previous * 100).toFixed(1)} % vs. período anterior`
}

export function EtsySalesPanel({ sales, syncing, onSync, compact = false }: {
  sales: Sales | null; syncing: boolean; onSync: () => void; compact?: boolean
}) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const ready = Boolean(sales?.authorized && sales.complete && sales.current && sales.previous)
  const current = ready ? sales!.current! : null
  const previous = ready ? sales!.previous! : null
  const currencies = current?.financialComplete ? Object.entries(current.currencies) : []
  const single = currencies.length === 1 ? currencies[0] : null
  const previousTotal = single ? previous?.currencies[single[0]]?.orderTotal ?? 0 : 0
  const statusText = !sales ? "Cargando estado de ventas" : !sales.connected ? "Etsy sin conectar" : !sales.authorized ? "Falta permiso para leer pedidos" :
    sales.status === "partial" ? "Sincronización parcial; se conservan los últimos datos completos" :
    sales.status === "failed" ? "Falló la última sincronización; se conservan datos anteriores" :
    sales.status === "running" ? "Sincronizando" : sales.lastSuccessAt ? "Datos de pedidos sincronizados" : "Pedidos sin sincronizar"
  return <section className="space-y-4 border-t border-white/10 pt-6">
    <SectionHeading eyebrow="ETSY / VENTAS" title="Pedidos e ingresos" description="Recibos creados en el período; importes de pedidos pagados o completados, no beneficio neto."
      action={<div className="flex flex-wrap gap-2">
        {sales && !sales.authorized && <a href="/api/etsy/auth/start" className="inline-flex items-center gap-1 rounded-md border border-[#eeba2b]/40 px-3 py-2 text-xs font-medium text-[#f1cc61] hover:bg-[#eeba2b]/10">
          {sales.connected ? "Reautorizar Etsy" : "Conectar Etsy"} <ArrowUpRight size={14} aria-hidden="true" /></a>}
        <button type="button" onClick={onSync} disabled={syncing || !sales?.authorized}
          className="inline-flex items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-xs font-medium text-neutral-200 hover:border-[#eeba2b]/50 disabled:opacity-40">
          <RefreshCw size={14} className={syncing ? "animate-spin" : ""} aria-hidden="true" /> Sincronizar ventas
        </button>
      </div>} />
    <p className="text-xs text-neutral-400" role="status">{statusText}
      {sales?.lastSuccessAt ? ` · Última actualización: ${new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(sales.lastSuccessAt))}` : ""}</p>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricTile label="Pedidos" value={current?.orders ?? "--"} context={current && previous ? delta(current.orders, previous.orders) : "Sin datos completos"}
        icon={ShoppingBag} title="Todos los recibos creados en el período, incluidos no pagados y cancelados." />
      <MetricTile label="Pagados" value={current?.paid ?? "--"} context="Estado pagado o completado" icon={TrendingUp} tone="green" />
      <MetricTile label="Cancelados" value={current?.canceled ?? "--"} context="Estado cancelado" icon={CircleAlert} />
      <MetricTile label="Importe de pedidos" value={single ? currency(single[1].orderTotal, single[0]) : "--"}
        context={single ? delta(single[1].orderTotal, previousTotal) : currencies.length > 1 ? "Varias monedas; ver desglose" : "Importes no verificados"}
        icon={DollarSign} tone="gold" title="Suma de grandtotal de pedidos pagados o completados; incluye conceptos del pedido. No es dinero recibido ni beneficio." />
    </div>
    {ready && currencies.length > 0 && <div className="flex flex-wrap gap-x-8 gap-y-2 border-y border-white/10 py-3 text-xs text-neutral-300">
      {currencies.map(([code, totals]) => <div key={code} className="space-y-1">
        <p className="font-semibold text-neutral-100">{code}: {currency(totals.orderTotal, code)}</p>
        <p>Artículos: {totals.itemSubtotal == null ? "--" : currency(totals.itemSubtotal, code)} · Envíos: {totals.shipping == null ? "--" : currency(totals.shipping, code)}</p>
        <p>Impuestos: {totals.tax == null ? "--" : currency(totals.tax, code)} · Descuentos: {totals.discount == null ? "--" : currency(totals.discount, code)}</p>
        <p>Ticket medio del pedido: {currency(totals.orderTotal / totals.orders, code)}</p>
      </div>)}
    </div>}
    {!compact && ready && <div className="border-t border-white/10 pt-4">
      <h3 className="text-sm font-semibold text-neutral-200">Evolución diaria de pedidos</h3>
      <p className="mt-1 text-xs text-neutral-500">Selecciona una fecha para ver el conteo. La altura representa pedidos, no ingresos.</p>
      <div className="mt-4 flex h-40 items-end gap-px overflow-x-auto border-b border-white/10 pb-1" role="group" aria-label="Pedidos por fecha">
        {sales!.daily.map((day) => {
          const maximum = Math.max(1, ...sales!.daily.map((entry) => entry.orders))
          return <button key={day.date} type="button" onClick={() => setSelectedDay(day.date)}
            title={`${day.date}: ${day.orders} pedidos`} aria-label={`${day.date}: ${day.orders} pedidos`}
            aria-pressed={selectedDay === day.date}
            className={`min-w-[5px] flex-1 rounded-t-sm transition-colors hover:bg-[#f1cc61] focus-visible:outline-2 focus-visible:outline-[#f1cc61] ${selectedDay === day.date ? "bg-[#f1cc61]" : "bg-[#eeba2b]/60"}`}
            style={{ height: `${Math.max(4, day.orders / maximum * 100)}%` }} />
        })}
      </div>
      <p className="mt-2 text-xs text-neutral-400">{selectedDay ? `${selectedDay}: ${sales!.daily.find((day) => day.date === selectedDay)?.orders ?? 0} pedidos` : "Selecciona un día"}</p>
    </div>}
    {!compact && ready && <div className="border-t border-white/10 pt-4">
      <h3 className="text-sm font-semibold text-neutral-200">Productos más vendidos</h3>
      {!sales!.productReady ? <p className="mt-2 text-xs text-neutral-400">Etsy no devolvió el detalle de todas las transacciones de este período.</p> :
        sales!.products.length ? <div className="mt-3 divide-y divide-white/8">
          {sales!.products.map((item, index) => <div key={`${item.listingId}-${item.currency}-${index}`} className="flex flex-wrap items-center justify-between gap-3 py-2 text-xs text-neutral-300">
            <span>Listing {item.listingId ?? "sin ID"}</span><span>{item.units} unidades</span>
            <span>{item.lineTotal != null && item.currency ? currency(item.lineTotal, item.currency) : "Importe no disponible"}</span>
          </div>)}
        </div> : <p className="mt-2 text-xs text-neutral-400">No hay unidades vendidas en este período.</p>}
      <p className="mt-2 text-xs text-neutral-500">Importes brutos de líneas antes de descuentos; no equivalen al total recibido por listing.</p>
    </div>}
    {ready && current && current.financialComplete === false && <p className="text-xs text-amber-200">Algunos recibos no contienen importes verificables. Se oculta el total monetario.</p>}
    <p className="text-xs text-neutral-500">Reembolsos, comisiones, dinero recibido y beneficio neto requieren conciliación adicional; no están incluidos.</p>
  </section>
}
