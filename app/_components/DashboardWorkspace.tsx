"use client"

import { useEffect, useState } from "react"
import { Activity, ArrowRight, BarChart3, CircleAlert, DollarSign, Eye, Megaphone,
  MousePointer2, PackageCheck, ReceiptText, RefreshCw, ShoppingBag, TrendingUp, Wallet } from "lucide-react"
import type { DashboardOverview, DashboardPeriod } from "@/lib/dashboard/overview"
import type { getCatalogSnapshot } from "@/lib/dashboard/etsy-catalog"
import { ProductionTrend, StatusDonut } from "./dashboard/DashboardCharts"
import { LoadingPanel, MetricTile, PendingSource, SectionHeading, SourceBadge } from "./dashboard/DashboardPrimitives"

type Section = "overview" | "sales" | "costs" | "traffic" | "advertising" | "pinterest" | "operations"
type Catalog = ReturnType<typeof getCatalogSnapshot>
const sections: Array<{ id: Section; label: string }> = [
  { id: "overview", label: "Resumen" }, { id: "sales", label: "Ventas" },
  { id: "costs", label: "Gastos" }, { id: "traffic", label: "Tráfico" },
  { id: "advertising", label: "Publicidad" }, { id: "pinterest", label: "Pinterest" },
  { id: "operations", label: "Operaciones" },
]

const pendingSections = {
  sales: { title: "Ventas e ingresos", description: "Pedidos, ingresos y productos vendidos se incorporarán cuando conectemos la analítica comercial de Etsy.",
    source: "Pedidos de Etsy", icon: ShoppingBag,
    metrics: [{ label: "Ingresos", icon: DollarSign }, { label: "Pedidos", icon: ShoppingBag }, { label: "Ticket medio", icon: TrendingUp }] },
  costs: { title: "Gastos y rentabilidad", description: "Las comisiones y los gastos necesitan registros verificables antes de calcular beneficios.",
    source: "Comisiones de Etsy y gastos registrados", icon: Wallet,
    metrics: [{ label: "Gastos", icon: ReceiptText }, { label: "Beneficio neto", icon: Wallet }, { label: "Margen", icon: TrendingUp }] },
  traffic: { title: "Tráfico y conversión", description: "Las visitas, las fuentes y la conversión requieren datos analíticos de la tienda.",
    source: "Estadísticas de Etsy", icon: Eye,
    metrics: [{ label: "Visitas", icon: Eye }, { label: "Conversión", icon: TrendingUp }, { label: "Fuentes", icon: MousePointer2 }] },
  advertising: { title: "Publicidad", description: "Inversión, clics y retorno solo se mostrarán cuando exista una fuente de campañas autorizada.",
    source: "Etsy Ads y otras plataformas autorizadas", icon: Megaphone,
    metrics: [{ label: "Inversión", icon: Wallet }, { label: "Clics", icon: MousePointer2 }, { label: "ROAS", icon: TrendingUp }] },
  pinterest: { title: "Pinterest", description: "Publicar pines no equivale a disponer de analítica. Esta se añadirá con una fuente verificada.",
    source: "Pinterest Analytics", icon: BarChart3,
    metrics: [{ label: "Impresiones", icon: Eye }, { label: "Clics salientes", icon: MousePointer2 }, { label: "Guardados", icon: PackageCheck }] },
} as const

function formatCount(value: number) { return new Intl.NumberFormat("es-ES").format(value) }
function formatDate(value: string) { return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) }

function OperationsContent({ data, onOpenAutomation }: { data: DashboardOverview; onOpenAutomation: () => void }) {
  return <div className="space-y-8">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricTile label="Trabajos" value={formatCount(data.total)} context="Creados en el periodo" icon={PackageCheck} tone="gold"
        title="Trabajos creados en el periodo seleccionado, clasificados por su estado actual." />
      <MetricTile label="En curso" value={formatCount(data.active)} context="Estado actual" icon={Activity} />
      <MetricTile label="Completados" value={formatCount(data.completed)} context="Estado actual" icon={PackageCheck} tone="green" />
      <MetricTile label="Requieren atención" value={formatCount(data.attention)} context="Estado actual" icon={CircleAlert} tone={data.attention ? "red" : "neutral"} />
    </div>
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)]">
      <section className="min-w-0 border-t border-white/10 pt-5">
        <SectionHeading eyebrow="ACTIVIDAD" title="Nuevos trabajos" description="Altas reales de Automation. No representa ventas ni trabajos completados por día." />
        <div className="mt-6"><ProductionTrend data={data} /></div>
      </section>
      <section className="min-w-0 border-t border-white/10 pt-5">
        <SectionHeading eyebrow="ESTADO ACTUAL" title="Distribución del periodo"
          description="Estado actual de los trabajos creados en el intervalo seleccionado." />
        <div className="mt-5"><StatusDonut data={data} /></div>
      </section>
    </div>
    <section className="border-t border-white/10 pt-5">
      <SectionHeading eyebrow="SEGUIMIENTO" title="Trabajos recientes" action={<button type="button" onClick={onOpenAutomation}
        className="inline-flex items-center gap-1 text-sm font-medium text-[#eeba2b] transition hover:text-[#f7d875] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#eeba2b]">
        Abrir Automation <ArrowRight size={15} aria-hidden="true" /></button>} />
      {data.recent.length ? <div className="mt-4 divide-y divide-white/8 border-y border-white/8">
        {data.recent.map((job) => <div key={job.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-sm">
          <span className="font-medium text-neutral-200">{job.productCode}</span>
          <span className="text-xs text-neutral-400">{job.status.replaceAll("_", " ")}</span>
          <span className="text-xs text-neutral-500">{formatDate(job.createdAt)}</span>
        </div>)}
      </div> : <p className="mt-4 rounded-md border border-dashed border-white/10 px-4 py-5 text-sm text-neutral-400">
        No se han creado trabajos en este periodo.
      </p>}
    </section>
  </div>
}

function PendingSection({ section }: { section: keyof typeof pendingSections }) {
  const item = pendingSections[section]
  return <div className="space-y-7">
    <SectionHeading eyebrow="ANALITICA COMERCIAL" title={item.title} description={item.description}
      action={<SourceBadge state="not_implemented" />} />
    <div className="grid gap-3 sm:grid-cols-3">
      {item.metrics.map((metric) => <MetricTile key={metric.label} label={metric.label} value="--" context="Sin fuente verificada"
        icon={metric.icon} title="Esta métrica no se calcula hasta disponer de datos de origen verificados." />)}
    </div>
    <div className="border-y border-white/10 py-1">
      <PendingSource title={item.title} description="La estructura está preparada; todavía no se recopilan datos para esta sección."
        source={item.source} icon={item.icon} />
    </div>
  </div>
}

export function DashboardWorkspace({ onOpenAutomation }: { onOpenAutomation: () => void }) {
  const [section, setSection] = useState<Section>("overview")
  const [period, setPeriod] = useState<DashboardPeriod>("30d")
  const [reloadId, setReloadId] = useState(0)
  const [data, setData] = useState<DashboardOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    void fetch(`/api/dashboard/overview?period=${period}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as DashboardOverview & { error?: string }
        if (!response.ok) throw new Error(body.error || "No se pudieron cargar los datos.")
        return body
      })
      .then((result) => { setData(result); setError(null); setLoading(false) })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(reason instanceof Error ? reason.message : "No se pudieron cargar los datos.")
        setLoading(false)
      })
    return () => controller.abort()
  }, [period, reloadId])

  useEffect(() => {
    const controller = new AbortController()
    void fetch(`/api/dashboard/etsy?period=${period}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as Catalog & { error?: string }
        if (!response.ok) throw new Error(body.error || "No se pudo leer Etsy.")
        return body
      })
      .then((result) => { setCatalog(result); setCatalogError(null) })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setCatalogError(reason instanceof Error ? reason.message : "No se pudo leer Etsy.") })
    return () => controller.abort()
  }, [period, reloadId])

  const syncCatalog = async () => {
    setSyncing(true)
    setCatalogError(null)
    try {
      const response = await fetch("/api/dashboard/etsy/sync", { method: "POST" })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || "No se pudo sincronizar Etsy.")
      setReloadId((value) => value + 1)
    } catch (reason) {
      setCatalogError(reason instanceof Error ? reason.message : "No se pudo sincronizar Etsy.")
    } finally { setSyncing(false) }
  }

  const changePeriod = (next: DashboardPeriod) => { if (next !== period) { setLoading(true); setPeriod(next) } }
  const refresh = () => { setLoading(true); setReloadId((value) => value + 1) }
  const currentData = data?.period === period ? data : null

  return <div className="space-y-7 pb-12 text-neutral-100">
    <header className="flex flex-col gap-5 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase text-[#eeba2b]">AUTOLISTY / CENTRO DE CONTROL</p>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Dashboard</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-400">Datos verificados del negocio y estado de la producción en un solo lugar.</p>
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
        {currentData && <span className="w-full text-xs text-neutral-500 lg:mr-1 lg:w-auto" title="Última consulta de Automation">
          Actualizado {formatDate(currentData.asOf)}</span>}
        <div className="inline-flex rounded-md border border-white/10 bg-white/[0.03] p-1" role="group" aria-label="Periodo del Dashboard">
          {(["7d", "30d", "90d"] as const).map((item) => <button key={item} type="button" onClick={() => changePeriod(item)}
            aria-pressed={period === item} title={`Datos temporales de los últimos ${item.slice(0, -1)} días`}
            className={`min-w-11 rounded px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#eeba2b] ${period === item
              ? "bg-[#eeba2b] text-[#16130a]" : "text-neutral-400 hover:bg-white/8 hover:text-white"}`}>{item}</button>)}
        </div>
        <button type="button" onClick={refresh} disabled={loading} title="Actualizar datos de Automation" aria-label="Actualizar Dashboard"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-neutral-200 transition hover:border-[#eeba2b]/50 hover:text-[#eeba2b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#eeba2b] disabled:opacity-50">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} aria-hidden="true" />
        </button>
      </div>
    </header>

    <div className="sm:hidden">
      <label htmlFor="dashboard-section" className="mb-2 block text-xs font-medium text-neutral-400">Sección</label>
      <select id="dashboard-section" value={section} onChange={(event) => setSection(event.target.value as Section)}
        className="w-full rounded-md border border-white/15 bg-[#161d22] px-3 py-2.5 text-sm text-neutral-100 outline-none focus-visible:border-[#eeba2b]">
        {sections.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </div>
    <nav aria-label="Secciones del Dashboard" className="hidden gap-1 overflow-x-auto border-b border-white/10 pb-px sm:flex">
      {sections.map((item) => <button key={item.id} type="button" onClick={() => setSection(item.id)} aria-current={section === item.id ? "page" : undefined}
        className={`shrink-0 border-b-2 px-3 py-3 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#eeba2b] ${section === item.id
          ? "border-[#eeba2b] font-medium text-neutral-100" : "border-transparent text-neutral-400 hover:text-neutral-100"}`}>{item.label}</button>)}
    </nav>

    {error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-rose-400/25 bg-rose-400/8 p-4 text-sm text-rose-200">
      <CircleAlert size={18} aria-hidden="true" /><span className="flex-1">{error}</span>
      <button type="button" onClick={refresh} className="font-semibold underline underline-offset-2">Reintentar</button>
    </div>}
    {catalogError && <div role="alert" className="rounded-md border border-rose-400/25 bg-rose-400/8 p-3 text-sm text-rose-200">{catalogError}</div>}

    {section === "overview" && <div className="space-y-8">
      <section className="space-y-4">
        <SectionHeading eyebrow="RESUMEN EJECUTIVO" title="Pulso del negocio" action={<SourceBadge state="not_implemented" />} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricTile label="Ingresos" value="--" context="Pedidos de Etsy pendientes" icon={DollarSign} />
          <MetricTile label="Ventas" value="--" context="Pedidos de Etsy pendientes" icon={ShoppingBag} />
          <MetricTile label="Beneficio neto" value="--" context="Gastos y ventas pendientes" icon={Wallet} />
          {currentData ? <MetricTile label="Producción" value={formatCount(currentData.total)} context="Trabajos creados en el periodo"
            icon={Activity} tone="gold" title="No representa ventas. Son trabajos reales creados en Automation." />
            : <MetricTile label="Producción" value="--" context="Consultando Automation" icon={Activity} tone="gold" />}
        </div>
      </section>
      <CatalogSection catalog={catalog} syncing={syncing} onSync={syncCatalog} />
      <section className="space-y-5 border-t border-white/10 pt-6">
        <SectionHeading eyebrow="OPERACIONES" title="Producción en marcha" action={<button type="button" onClick={() => setSection("operations")}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#eeba2b] hover:text-[#f7d875]">Ver operaciones <ArrowRight size={15} /></button>} />
        {loading && !currentData ? <LoadingPanel /> : currentData ? <div className="grid gap-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,1fr)]">
          <ProductionTrend data={currentData} /><StatusDonut data={currentData} />
        </div> : <p className="text-sm text-neutral-400">Automation no esta disponible.</p>}
      </section>
      <section className="border-t border-white/10 pt-6">
        <SectionHeading eyebrow="FUENTES" title="Cobertura de datos" description="Las métricas comerciales se añadirán al conectar fuentes verificadas." />
        <div className="mt-4 grid gap-x-8 lg:grid-cols-2">
          <PendingSource title="Ventas y rentabilidad" description="Pedidos, ingresos, comisiones y gastos." source="Etsy y registros financieros" icon={ReceiptText} />
          <PendingSource title="Tráfico y conversión" description="Visitas, fuentes y rendimiento del catálogo." source="Etsy Analytics" icon={Eye} />
          <PendingSource title="Publicidad" description="Inversión, clics y retorno de campañas." source="Cuentas publicitarias" icon={Megaphone} />
          <PendingSource title="Pinterest" description="Impresiones, guardados y clics salientes." source="Pinterest Analytics" icon={BarChart3} />
        </div>
      </section>
    </div>}

    {section === "operations" && <div className="space-y-6">
      <SectionHeading eyebrow="AUTOMATION" title="Operaciones" description="Trabajos creados en el periodo seleccionado, clasificados por su estado actual."
        action={<SourceBadge state={error ? "error" : loading && !currentData ? "loading" : !currentData ? "not_connected" : currentData.total ? "available" : "empty"} />} />
      {loading && !currentData ? <LoadingPanel /> : currentData ? <OperationsContent data={currentData} onOpenAutomation={onOpenAutomation} />
        : <p className="text-sm text-neutral-400">No se pudo obtener el estado operativo.</p>}
      <CatalogSection catalog={catalog} syncing={syncing} onSync={syncCatalog} compact />
    </div>}
    {section === "sales" && <div className="space-y-8"><PendingSection section="sales" />
      <CatalogSection catalog={catalog} syncing={syncing} onSync={syncCatalog} /></div>}
    {section !== "overview" && section !== "operations" && section !== "sales" && <PendingSection section={section} />}
    <footer className="border-t border-white/8 pt-4 text-xs text-neutral-500">
      Los conteos de Automation corresponden a trabajos creados en el periodo y muestran su estado actual. No son datos de ventas.
    </footer>
  </div>
}

function CatalogSection({ catalog, syncing, onSync, compact = false }: { catalog: Catalog | null; syncing: boolean;
  onSync: () => void; compact?: boolean }) {
  const counts = catalog?.counts
  const status = catalog?.status
  const statusText = status === "complete" ? "Sincronización completa" : status === "partial" ? "Datos parciales" :
    status === "failed" ? "Falló la última sincronización; se conserva la anterior" :
    status === "running" ? "Sincronizando" : status === "not_connected" ? "Etsy sin conectar" : "Sin sincronizar"
  return <section className="border-t border-white/10 pt-6">
    <SectionHeading eyebrow="ETSY / CATÁLOGO" title="Catálogo de la tienda"
      description="Conteos actuales de la tienda. Las altas por período usan la fecha de creación, no la de publicación."
      action={<button type="button" onClick={onSync} disabled={syncing || !catalog?.connected}
        className="inline-flex items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-xs font-medium text-neutral-200 hover:border-[#eeba2b]/50 disabled:opacity-40">
        <RefreshCw size={14} className={syncing ? "animate-spin" : ""} /> Sincronizar Etsy
      </button>} />
    <p className="mt-3 text-xs text-neutral-400" role="status">{statusText}
      {catalog?.lastSuccessAt ? ` · Últimos datos: ${formatDate(catalog.lastSuccessAt)}` : ""}</p>
    <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricTile label="Activos" value={counts?.active == null ? "--" : formatCount(counts.active)} context="Estado actual" icon={ShoppingBag} tone="green" />
      <MetricTile label="Borradores" value={counts?.draft == null ? "--" : formatCount(counts.draft)} context="Estado actual" icon={PackageCheck} />
      <MetricTile label="Inactivos" value={counts?.inactive == null ? "--" : formatCount(counts.inactive)} context="Estado actual" icon={CircleAlert} />
      <MetricTile label="Creados en el período" value={catalog?.createdInPeriod == null ? "--" : formatCount(catalog.createdInPeriod)}
        context={catalog?.detailsComplete ? "Fecha de creación; no de publicación" : "Requiere catálogo completo"} icon={TrendingUp}
        title="No representa productos publicados ni vendidos. Solo listings con fecha de creación dentro del período." />
    </div>
    {!compact && Boolean(catalog?.listings.length) && <div className="mt-5 overflow-x-auto border-y border-white/10">
      <table className="w-full min-w-[500px] text-left text-xs"><thead className="text-neutral-500"><tr>
        <th className="py-3 pr-3 font-medium">ID</th><th className="py-3 pr-3 font-medium">Listing</th>
        <th className="py-3 pr-3 font-medium">Estado</th><th className="py-3 font-medium">Precio</th>
      </tr></thead><tbody className="divide-y divide-white/8 text-neutral-300">
        {catalog!.listings.map((item) => <tr key={item.id}><td className="py-3 pr-3 tabular-nums">{item.id}</td>
          <td className="max-w-sm truncate py-3 pr-3">{item.title}</td><td className="py-3 pr-3">{item.state}</td>
          <td className="py-3">{item.amount != null && item.divisor && item.currency ?
            new Intl.NumberFormat("es-ES", { style: "currency", currency: item.currency }).format(item.amount / item.divisor) : "--"}</td>
        </tr>)}</tbody></table>
      {!catalog?.detailsComplete && <p className="py-2 text-xs text-amber-200">Detalle parcial; los conteos provienen de Etsy.</p>}
    </div>}
  </section>
}
