"use client"

import { useEffect, useState } from "react"
import { Info } from "lucide-react"
import type { DashboardHome as HomeData, Kpi } from "@/lib/dashboard/home"
import type { DashboardPeriod } from "@/lib/dashboard/overview"

type Home = HomeData & {
  health: { etsyConnected: boolean; pinterestConnected: boolean; etsyCallsToday: number; appVersion: string | null }
}

const card = "rounded-xl border border-white/[0.08] bg-[#141416]"

const PRODUCT_LABELS: Record<string, string> = {
  frame_tv_art: "Frame TV Art",
  vertical_wall_art: "Vertical Wall Art",
  horizontal_wall_art: "Horizontal Wall Art",
  nursery_wall_art: "Nursery Wall Art",
  png_designs: "PNG Designs",
}

function money(value: number, currency: string, digits = 0) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)
}
function count(value: number) {
  return new Intl.NumberFormat("es-ES").format(value)
}
function ago(iso: string | null) {
  if (!iso) return "nunca"
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000))
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `hace ${hours} h`
  return `hace ${Math.round(hours / 24)} días`
}
function dayLabel(date: string) {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))
}

function Delta({ kpi }: { kpi: Kpi }) {
  if (kpi.current == null || kpi.previous == null) return <span className="text-xs text-neutral-500">Sin periodo anterior comparable</span>
  if (kpi.previous === 0) {
    return <span className="text-xs text-neutral-400">{kpi.current > 0 ? "Sin actividad antes" : "Igual que antes"}</span>
  }
  const change = (kpi.current - kpi.previous) / kpi.previous
  const percent = Math.round(change * 100)
  const tone = percent > 0 ? "text-emerald-300" : percent < 0 ? "text-orange-300" : "text-neutral-400"
  return <span className={`text-xs ${tone}`}>{percent > 0 ? "+" : percent < 0 ? "−" : "±"}{Math.abs(percent)} % vs. periodo anterior</span>
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2 || values.every((value) => value === 0)) return null
  // Como mucho 15 barras: se agrupan los días.
  const size = Math.ceil(values.length / 15)
  const buckets: number[] = []
  for (let index = 0; index < values.length; index += size) buckets.push(values.slice(index, index + size).reduce((a, b) => a + b, 0))
  const max = Math.max(...buckets, 1)
  return (
    <div aria-hidden="true" className="flex h-6 items-end gap-[2px]">
      {buckets.map((value, index) => (
        <div key={index} className={`w-1 rounded-sm ${index === buckets.length - 1 ? "bg-[#eeba2b]" : "bg-white/20"}`} style={{ height: `${Math.max(8, (value / max) * 100)}%` }} />
      ))}
    </div>
  )
}

function KpiTile({ label, value, kpi, info }: { label: string; value: string; kpi: Kpi; info: string }) {
  return (
    <div className={`flex flex-col gap-1.5 p-4 ${card}`}>
      <div className="flex items-center justify-between gap-2 text-[13px] text-neutral-400">
        <span>{label}</span>
        <span title={info} aria-label={info} className="text-neutral-500"><Info size={14} aria-hidden="true" /></span>
      </div>
      <div className="text-2xl font-semibold tracking-tight text-neutral-100">{value}</div>
      <div className="flex items-end justify-between gap-2">
        <Delta kpi={kpi} />
        <Spark values={kpi.spark} />
      </div>
    </div>
  )
}

function DailyChart({ data, currency }: { data: Home["daily"]; currency: string | null }) {
  const [selected, setSelected] = useState<number | null>(null)
  const useRevenue = currency != null
  const values = data.map((day) => (useRevenue ? day.revenue ?? 0 : day.orders))
  const max = Math.max(...values, 0)
  // Escala redonda para el eje.
  const step = max <= 4 ? 1 : Math.pow(10, Math.floor(Math.log10(max / 4)))
  const niceStep = [1, 2, 5, 10].map((factor) => factor * step).find((candidate) => candidate * 4 >= max) || step * 10
  const top = Math.max(niceStep * 4, 1)
  const ticks = [4, 3, 2, 1, 0].map((index) => index * niceStep)
  const format = (value: number) => (useRevenue ? money(value, currency!) : count(value))
  const focus = selected ?? data.length - 1
  const day = data[focus]

  if (!data.length) {
    return <p className="py-10 text-center text-sm text-neutral-400">Sincroniza los pedidos de Etsy (pestaña Ventas) para ver la evolución diaria.</p>
  }
  return (
    <div>
      <div className="mb-3 min-h-10 text-sm" aria-live="polite">
        {day ? (
          <>
            <span className="text-neutral-400">{dayLabel(day.date)} · </span>
            <span className="font-semibold text-neutral-100">{day.orders} {day.orders === 1 ? "pedido" : "pedidos"}</span>
            {day.revenue != null && currency ? <span className="text-neutral-300"> · {money(day.revenue, currency, 2)}</span> : null}
          </>
        ) : null}
      </div>
      <div className="flex h-52 gap-2">
        <div className="flex w-12 shrink-0 flex-col justify-between text-right text-[11px] text-neutral-500">
          {ticks.map((tick) => <span key={tick} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">{format(tick)}</span>)}
        </div>
        <div className="relative flex flex-1 items-end gap-[3px] border-b border-l border-white/10 px-1">
          {ticks.slice(0, -1).map((tick) => (
            <div key={tick} aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t border-dashed border-white/[0.05]" style={{ bottom: `${(tick / top) * 100}%` }} />
          ))}
          {data.map((item, index) => (
            <button
              key={item.date}
              type="button"
              onClick={() => setSelected(index)}
              onMouseEnter={() => setSelected(index)}
              aria-label={`${dayLabel(item.date)}: ${item.orders} pedidos${item.revenue != null && currency ? `, ${money(item.revenue, currency, 2)}` : ""}`}
              className="group relative flex h-full flex-1 items-end"
            >
              <span
                className={`block w-full rounded-t-sm transition ${index === focus ? "bg-[#eeba2b]" : "bg-[#eeba2b]/35 group-hover:bg-[#eeba2b]/60"}`}
                style={{ height: `${values[index] > 0 ? Math.max(2, (values[index] / top) * 100) : 0}%` }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="ml-14 mt-1.5 flex justify-between text-[11px] text-neutral-500">
        <span>{dayLabel(data[0].date)}</span>
        <span>{dayLabel(data[Math.floor(data.length / 2)].date)}</span>
        <span>{dayLabel(data[data.length - 1].date)}</span>
      </div>
    </div>
  )
}

function Thumb({ jobId, size }: { jobId: string | null; size: string }) {
  if (!jobId) return <span aria-hidden="true" className={`${size} shrink-0 rounded-md bg-white/[0.05]`} />
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/automation/jobs/${jobId}/source?w=480`} alt="" loading="lazy" className={`${size} shrink-0 rounded-md bg-white/[0.05] object-cover`} />
  )
}

export function DashboardHome({ period, reloadId }: { period: DashboardPeriod; reloadId: number }) {
  const [data, setData] = useState<Home | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void fetch(`/api/dashboard/home?period=${period}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as Home & { error?: string }
        if (!response.ok) throw new Error(body.error || "No se pudo preparar el resumen.")
        return body
      })
      .then((body) => { setData(body); setError(null) })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "No se pudo preparar el resumen.") })
    return () => controller.abort()
  }, [period, reloadId])

  if (error && !data) return <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
  if (!data || data.period !== period) {
    return <div className="space-y-4" aria-label="Cargando"><div className="h-28 animate-pulse rounded-xl bg-white/5" /><div className="h-64 animate-pulse rounded-xl bg-white/5" /></div>
  }

  const { kpis, currency } = data
  const funnelSteps = [
    { label: "Enviados por Claude y a mano", value: data.funnel.submitted },
    { label: "Aprobados", value: data.funnel.approved },
    { label: "Producidos", value: data.funnel.produced },
    { label: "Publicados", value: data.funnel.published },
    { label: "Con ventas", value: data.funnel.withSales },
  ]
  const funnelMax = Math.max(data.funnel.submitted, 1)

  return (
    <div className="space-y-5">
      <section aria-label="Cifras" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile
          label="Ingresos"
          value={kpis.revenue.current != null && currency ? money(kpis.revenue.current, currency) : "—"}
          kpi={kpis.revenue}
          info="Importe de pedidos pagados en Etsy (total del pedido). No descuenta tarifas ni gastos."
        />
        <KpiTile label="Pedidos" value={kpis.orders.current != null ? count(kpis.orders.current) : "—"} kpi={kpis.orders}
          info="Pedidos pagados o completados en Etsy en el periodo." />
        <KpiTile
          label="Ticket medio"
          value={kpis.averageOrder.current != null && currency ? money(kpis.averageOrder.current, currency, 2) : "—"}
          kpi={kpis.averageOrder}
          info="Ingresos divididos entre pedidos pagados."
        />
        <KpiTile label="Listings activos" value={kpis.activeListings.current != null ? count(kpis.activeListings.current) : "—"} kpi={kpis.activeListings}
          info="Listings activos en la última sincronización del catálogo de Etsy." />
        <KpiTile label="Publicados" value={count(kpis.published.current ?? 0)} kpi={kpis.published}
          info="Diseños de Automation que pasaron a activos en Etsy durante el periodo." />
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
        <section aria-label="Ventas por día" className={`p-5 ${card}`}>
          <h2 className="text-[15px] font-semibold text-neutral-100">{currency ? "Ingresos por día" : "Pedidos por día"}</h2>
          <p className="mb-4 mt-0.5 text-xs text-neutral-500">Toca una barra para ver el día</p>
          <DailyChart data={data.daily} currency={currency} />
        </section>

        <section aria-label="Embudo de producción" className={`p-5 ${card}`}>
          <h2 className="text-[15px] font-semibold text-neutral-100">Embudo de producción</h2>
          <p className="mb-4 mt-0.5 text-xs text-neutral-500">Diseños creados en el periodo</p>
          <div className="space-y-3.5">
            {funnelSteps.map((step) => (
              <div key={step.label}>
                <div className="flex justify-between text-[13px]">
                  <span className="text-neutral-300">{step.label}</span>
                  <span className="font-semibold text-neutral-100">{step.value}</span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-white/[0.06]">
                  <div className="h-2 rounded-full bg-[#eeba2b]" style={{ width: `${(step.value / funnelMax) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-label="Más vendidos" className={`p-5 ${card}`}>
          <h2 className="mb-2 text-[15px] font-semibold text-neutral-100">Más vendidos</h2>
          {data.top.length ? data.top.map((item) => (
            <a key={item.listingId} href={`https://www.etsy.com/listing/${item.listingId}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-3 border-t border-white/[0.06] py-2.5 first:border-0 hover:bg-white/[0.02]">
              <Thumb jobId={item.jobId} size="h-11 w-11" />
              <span className="min-w-0 flex-1 truncate text-sm text-neutral-200">{item.title || `Listing ${item.listingId}`}</span>
              <span className="w-14 shrink-0 text-right text-[13px] text-neutral-400">{item.units} uds</span>
              <span className="w-20 shrink-0 text-right text-sm font-semibold text-neutral-100">
                {item.revenue != null && currency ? money(item.revenue, currency, 2) : "—"}
              </span>
            </a>
          )) : <p className="py-6 text-sm text-neutral-400">Sin ventas con detalle de producto en este periodo.</p>}
        </section>

        <section aria-label="Sin movimiento" className={`p-5 ${card}`}>
          <h2 className="text-[15px] font-semibold text-neutral-100">Sin ventas en el periodo</h2>
          <p className="mb-2 mt-0.5 text-xs text-neutral-500">Los más antiguos primero: base para decidir qué no renovar</p>
          {data.quiet.length ? data.quiet.map((item) => (
            <a key={item.listingId} href={`https://www.etsy.com/listing/${item.listingId}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-3 border-t border-white/[0.06] py-2.5 first:border-0 hover:bg-white/[0.02]">
              <Thumb jobId={item.jobId} size="h-9 w-9" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-200">{item.title}</span>
              {item.seasonal ? <span className="shrink-0 rounded-md bg-sky-400/10 px-2 py-0.5 text-[11px] text-sky-300">Estacional</span> : null}
              <span className="w-16 shrink-0 text-right text-xs text-neutral-400">{item.ageDays != null ? `${item.ageDays} días` : "—"}</span>
            </a>
          )) : <p className="py-6 text-sm text-neutral-400">Se necesitan el catálogo y los pedidos sincronizados.</p>}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(280px,1fr)_minmax(0,1.7fr)]">
        <section aria-label="Ventas por producto" className={`p-5 ${card}`}>
          <h2 className="mb-4 text-[15px] font-semibold text-neutral-100">Ventas por producto</h2>
          {data.byProduct.length ? (
            <div className="space-y-3.5">
              {data.byProduct.map((item) => {
                const max = Math.max(...data.byProduct.map((entry) => entry.units), 1)
                return (
                  <div key={item.productType}>
                    <div className="flex justify-between gap-3 text-[13px]">
                      <span className="text-neutral-300">{PRODUCT_LABELS[item.productType] || "Otros"}</span>
                      <span className="text-neutral-100">
                        <span className="font-semibold">{item.units} uds</span>
                        {item.revenue != null && currency ? <span className="text-neutral-400"> · {money(item.revenue, currency)}</span> : null}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-white/[0.06]">
                      <div className="h-2 rounded-full bg-[#eeba2b]" style={{ width: `${(item.units / max) * 100}%` }} />
                    </div>
                  </div>
                )
              })}
              <p className="text-[11px] text-neutral-500">Los listings anteriores a Automation se clasifican por su título.</p>
            </div>
          ) : <p className="py-6 text-sm text-neutral-400">Sin ventas con detalle de producto en este periodo.</p>}
        </section>

        <section aria-label="Coste y margen por listing" className={`p-5 ${card}`}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-neutral-100">Coste y margen por listing</h2>
            <span
              className="text-neutral-500"
              title={`Coste = tarifa de publicación de Etsy (0,20 $) + OpenAI medido + R2 estimado, convertido a ${currency || "la moneda de la tienda"} a ${data.costs.rate}. Ingresos brutos de siempre; no descuenta las comisiones de venta de Etsy.`}
              aria-label="Cómo se calcula"
            >
              <Info size={14} aria-hidden="true" />
            </span>
          </div>
          <p className="mb-2 mt-0.5 text-xs text-neutral-500">Listings publicados por Automation</p>
          {data.costs.rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-[13px]">
                <thead className="text-xs text-neutral-500">
                  <tr>
                    <th scope="col" className="py-2 font-normal">Listing</th>
                    <th scope="col" className="py-2 text-right font-normal">OpenAI</th>
                    <th scope="col" className="py-2 text-right font-normal">Coste total</th>
                    <th scope="col" className="py-2 text-right font-normal">Ingresos</th>
                    <th scope="col" className="py-2 text-right font-normal">Margen</th>
                  </tr>
                </thead>
                <tbody>
                  {data.costs.rows.slice(0, 12).map((row) => (
                    <tr key={row.jobId} className="border-t border-white/[0.06]">
                      <td className="max-w-[220px] py-2 pr-3">
                        <a href={`https://www.etsy.com/listing/${row.listingId}`} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 text-neutral-200 hover:text-[#f1cc61]">
                          <Thumb jobId={row.jobId} size="h-8 w-8" />
                          <span className="truncate">{row.title || row.productCode}</span>
                        </a>
                      </td>
                      <td className="py-2 text-right text-neutral-400">{money(row.openaiUsd, "USD", 3)}</td>
                      <td className="py-2 text-right text-neutral-300">{money(row.totalUsd, "USD", 2)}</td>
                      <td className="py-2 text-right text-neutral-200">{row.revenue != null && currency ? money(row.revenue, currency, 2) : "—"}</td>
                      <td className={`py-2 text-right font-semibold ${row.margin == null ? "text-neutral-500" : row.margin >= 0 ? "text-emerald-300" : "text-orange-300"}`}>
                        {row.margin != null && currency ? money(row.margin, currency, 2) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="py-6 text-sm text-neutral-400">Todavía no hay listings publicados por Automation.</p>}
        </section>
      </div>

      <section aria-label="Salud del sistema" className="flex flex-wrap gap-x-5 gap-y-2 border-t border-white/[0.07] pt-4 text-[13px] text-neutral-400">
        <span><span className={data.health.etsyConnected ? "text-emerald-400" : "text-red-400"} aria-hidden="true">● </span>Etsy {data.health.etsyConnected ? "conectado" : "sin conectar"}</span>
        <span><span className={data.health.pinterestConnected ? "text-emerald-400" : "text-red-400"} aria-hidden="true">● </span>Pinterest {data.health.pinterestConnected ? "conectado" : "sin conectar"}</span>
        <span>Llamadas a Etsy hoy: {count(data.health.etsyCallsToday)}</span>
        <span>Pedidos sincronizados {ago(data.salesSyncedAt)}</span>
        <span>Última copia {ago(data.lastBackupAt)}</span>
        <span>Token de Etsy renovado {ago(data.credentialsRenewedAt.etsy)}</span>
        <span>Automaty visto {ago(data.automatyLastSeenAt)}{data.agentVersion ? ` · v${data.agentVersion}` : ""}</span>
        {data.health.appVersion ? <span>Versión {data.health.appVersion}</span> : null}
      </section>
    </div>
  )
}
