"use client"

import { useEffect, useState } from "react"
import { Activity, ArrowRight, CircleAlert, PackageCheck, RefreshCw, ShoppingBag, TrendingUp } from "lucide-react"
import type { DashboardOverview, DashboardPeriod } from "@/lib/dashboard/overview"
import type { getCatalogSnapshot } from "@/lib/dashboard/etsy-catalog"
import { ProductionTrend, StatusDonut } from "./dashboard/DashboardCharts"
import { EtsySalesPanel, type Sales } from "./dashboard/EtsySalesPanel"
import { FinancePanel } from "./dashboard/FinancePanel"
import { PinterestAnalyticsPanel, pinterestIssueText, type PinterestSnapshot } from "./dashboard/PinterestAnalyticsPanel"
import { AdvertisingPanel, TrafficPanel, type AdvertisingData, type TrafficData } from "./dashboard/TrafficAdvertisingPanels"
import { IntelligenceOverview, type Intelligence } from "./dashboard/IntelligenceOverview"
import { LoadingPanel, MetricTile, SectionHeading, SourceBadge } from "./dashboard/DashboardPrimitives"

type Section = "overview" | "sales" | "costs" | "traffic" | "advertising" | "pinterest" | "operations"
type Catalog = ReturnType<typeof getCatalogSnapshot>
const sections: Array<{ id: Section; label: string }> = [
  { id: "overview", label: "Resumen" }, { id: "sales", label: "Ventas" },
  { id: "costs", label: "Gastos" }, { id: "traffic", label: "Tráfico" },
  { id: "advertising", label: "Publicidad" }, { id: "pinterest", label: "Pinterest" },
  { id: "operations", label: "Operaciones" },
]

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
  const [sales, setSales] = useState<Sales | null>(null)
  const [salesError, setSalesError] = useState<string | null>(null)
  const [syncingSales, setSyncingSales] = useState(false)
  const [pinterest, setPinterest] = useState<PinterestSnapshot | null>(null)
  const [pinterestError, setPinterestError] = useState<string | null>(null)
  const [syncingPinterest, setSyncingPinterest] = useState(false)
  const [advertising, setAdvertising] = useState<AdvertisingData | null>(null)
  const [advertisingError, setAdvertisingError] = useState<string | null>(null)
  const [traffic, setTraffic] = useState<TrafficData | null>(null)
  const [trafficError, setTrafficError] = useState<string | null>(null)
  const [savingTraffic, setSavingTraffic] = useState(false)
  const [intelligence, setIntelligence] = useState<Intelligence | null>(null)
  const [intelligenceError, setIntelligenceError] = useState<string | null>(null)

  useEffect(() => {
    if (section !== "operations") return
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
  }, [period, reloadId, section])

  useEffect(() => {
    if (section !== "sales") return
    const controller = new AbortController()
    void fetch(`/api/dashboard/etsy/sales?period=${period}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as Sales & { error?: string }
        if (!response.ok) throw new Error(body.error || "No se pudieron leer las ventas.")
        return body
      })
      .then((result) => { setSales(result); setSalesError(null) })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setSalesError(reason instanceof Error ? reason.message : "No se pudieron leer las ventas.") })
    return () => controller.abort()
  }, [period, reloadId, section])

  useEffect(() => {
    if (section !== "sales" && section !== "operations") return
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
  }, [period, reloadId, section])

  useEffect(() => {
    if (section !== "pinterest") return
    const controller = new AbortController()
    void fetch(`/api/dashboard/pinterest?period=${period}`, {cache:"no-store",signal:controller.signal})
      .then(async (response) => { const body = await response.json() as PinterestSnapshot & {error?:string}
        if (!response.ok) throw new Error(body.error || "No se pudo leer Pinterest.");return body })
      .then((result) => {setPinterest(result);setPinterestError(null)})
      .catch((reason:unknown) => {if (!controller.signal.aborted) setPinterestError(reason instanceof Error ? reason.message : "No se pudo leer Pinterest.")})
    return () => controller.abort()
  },[period,reloadId,section])

  useEffect(() => {
    if (section !== "advertising") return
    const controller = new AbortController()
    void fetch(`/api/dashboard/advertising?period=${period}`, {cache:"no-store",signal:controller.signal})
      .then(async response => {if (!response.ok) throw new Error("No se pudieron leer los gastos publicitarios.");return await response.json() as AdvertisingData})
      .then(result => {setAdvertising(result);setAdvertisingError(null)})
      .catch(() => {if (!controller.signal.aborted) setAdvertisingError("No se pudieron leer los gastos publicitarios.")})
    return () => controller.abort()
  },[period,reloadId,section])

  useEffect(() => {
    if (section !== "traffic") return
    const controller = new AbortController()
    void fetch(`/api/dashboard/traffic?period=${period}`, {cache:"no-store",signal:controller.signal})
      .then(async response => {if (!response.ok) throw new Error("No se pudieron leer las estadísticas de tráfico.");return await response.json() as TrafficData})
      .then(result => {setTraffic(result);setTrafficError(null)})
      .catch(() => {if (!controller.signal.aborted) setTrafficError("No se pudieron leer las estadísticas de tráfico.")})
    return () => controller.abort()
  },[period,reloadId,section])

  useEffect(() => {
    if (section !== "overview") return
    const controller=new AbortController()
    void fetch(`/api/dashboard/intelligence?period=${period}`,{cache:"no-store",signal:controller.signal})
      .then(async response=>{if(!response.ok) throw new Error("No se pudo preparar el Resumen.");return await response.json() as Intelligence})
      .then(result=>{setIntelligence(result);setIntelligenceError(null)})
      .catch(()=>{if(!controller.signal.aborted)setIntelligenceError("No se pudo preparar el Resumen.")})
    return ()=>controller.abort()
  },[period,reloadId,section])

  const saveTraffic = async (values: Record<"visits"|"listingViews"|"etsySearchVisits"|"etsyAdsVisits"|"socialVisits"|"pinterestVisits",string>) => {
    setSavingTraffic(true);setTrafficError(null)
    try {
      const data=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,value===""?null:Number(value)]))
      const response=await fetch("/api/dashboard/traffic",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({period,data})})
      const body=await response.json() as TrafficData & {error?:string}
      if (!response.ok) throw new Error(body.error || "No se pudo guardar la observación.")
      setTraffic(body)
    } catch (error) {setTrafficError(error instanceof Error?error.message:"No se pudo guardar la observación.");throw error}
    finally {setSavingTraffic(false)}
  }

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

  const syncSales = async () => {
    setSyncingSales(true)
    setSalesError(null)
    try {
      const response = await fetch("/api/dashboard/etsy/sales/sync", { method: "POST" })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || "No se pudieron sincronizar las ventas.")
      setReloadId((value) => value + 1)
    } catch (reason) {
      setSalesError(reason instanceof Error ? reason.message : "No se pudieron sincronizar las ventas.")
    } finally { setSyncingSales(false) }
  }
  const syncPinterest = async () => {
    setSyncingPinterest(true);setPinterestError(null)
    try {
      const response = await fetch("/api/dashboard/pinterest/sync",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({period})})
      const body = await response.json() as {error?:string;stage?:string;httpStatus?:number|null;providerCode?:number|null}
      if (!response.ok) throw new Error(body.error === "sync_recent_or_running" ? "Ya hay una sincronización reciente o en curso. Espera diez minutos." :
        pinterestIssueText({stage:body.stage ?? "sync",code:body.error ?? "connection_failed",httpStatus:body.httpStatus ?? null,providerCode:body.providerCode ?? null}))
    } catch (reason) {setPinterestError(reason instanceof Error ? reason.message : "No se pudo sincronizar Pinterest.")}
    finally {setSyncingPinterest(false);setReloadId((value)=>value+1)}
  }

  const changePeriod = (next: DashboardPeriod) => { if (next !== period) { setLoading(true); setPeriod(next) } }
  const refresh = () => { setLoading(true); setReloadId((value) => value + 1) }
  const currentData = data?.period === period ? data : null
  const currentCatalog = catalog?.period === period ? catalog : null
  const currentSales = sales?.period === period ? sales : null
  const currentPinterest = pinterest?.period === period ? pinterest : null

  return <div className="space-y-7 pb-12 text-neutral-100">
    <header className="flex flex-col gap-5 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase text-[#eeba2b]">AUTOLISTY / CENTRO DE CONTROL</p>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Dashboard</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-400">Datos verificados del negocio y estado de la producción en un solo lugar.</p>
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
        {(section==="overview"?intelligence?.period===period?intelligence.asOf:null:section==="operations"?currentData?.asOf:null) &&
          <span className="w-full text-xs text-neutral-500 lg:mr-1 lg:w-auto">Actualizado {formatDate((section==="overview"?intelligence?.asOf:currentData?.asOf)!)}</span>}
        <div className="inline-flex rounded-md border border-white/10 bg-white/[0.03] p-1" role="group" aria-label="Periodo del Dashboard">
          {(["7d", "30d", "90d"] as const).map((item) => <button key={item} type="button" onClick={() => changePeriod(item)}
            aria-pressed={period === item} title={`Datos temporales de los últimos ${item.slice(0, -1)} días`}
            className={`min-w-11 rounded px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#eeba2b] ${period === item
              ? "bg-[#eeba2b] text-[#16130a]" : "text-neutral-400 hover:bg-white/8 hover:text-white"}`}>{item}</button>)}
        </div>
        <button type="button" onClick={refresh} disabled={section==="operations"&&loading} title="Actualizar sección" aria-label="Actualizar Dashboard"
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

    {error && section === "operations" && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-rose-400/25 bg-rose-400/8 p-4 text-sm text-rose-200">
      <CircleAlert size={18} aria-hidden="true" /><span className="flex-1">{error}</span>
      <button type="button" onClick={refresh} className="font-semibold underline underline-offset-2">Reintentar</button>
    </div>}
    {catalogError && (section === "sales" || section === "operations") && <div role="alert" className="rounded-md border border-rose-400/25 bg-rose-400/8 p-3 text-sm text-rose-200">{catalogError}</div>}
    {salesError && section === "sales" && <div role="alert" className="rounded-md border border-rose-400/25 bg-rose-400/8 p-3 text-sm text-rose-200">{salesError}</div>}
    {pinterestError && section === "pinterest" && <div role="alert" className="rounded-md border border-rose-400/25 bg-rose-400/8 p-3 text-sm text-rose-200">{pinterestError}</div>}
    {advertisingError && section === "advertising" && <div role="alert" className="rounded-md border border-rose-400/25 bg-rose-400/8 p-3 text-sm text-rose-200">{advertisingError}</div>}
    {trafficError && section === "traffic" && <div role="alert" className="rounded-md border border-rose-400/25 bg-rose-400/8 p-3 text-sm text-rose-200">{trafficError}</div>}

    {section === "overview" && <IntelligenceOverview data={intelligence?.period===period?intelligence:null}
      error={intelligenceError} onNavigate={setSection} onRetry={refresh} />}

    {section === "operations" && <div className="space-y-6">
      <SectionHeading eyebrow="AUTOMATION" title="Operaciones" description="Trabajos creados en el periodo seleccionado, clasificados por su estado actual."
        action={<SourceBadge state={error ? "error" : loading && !currentData ? "loading" : !currentData ? "not_connected" : currentData.total ? "available" : "empty"} />} />
      {loading && !currentData ? <LoadingPanel /> : currentData ? <OperationsContent data={currentData} onOpenAutomation={onOpenAutomation} />
        : <p className="text-sm text-neutral-400">No se pudo obtener el estado operativo.</p>}
      <CatalogSection catalog={currentCatalog} syncing={syncing} onSync={syncCatalog} compact />
    </div>}
    {section === "sales" && <div className="space-y-8"><EtsySalesPanel sales={currentSales} syncing={syncingSales} onSync={syncSales} />
      <CatalogSection catalog={currentCatalog} syncing={syncing} onSync={syncCatalog} /></div>}
    {section === "costs" && <FinancePanel period={period} />}
    {section === "pinterest" && <PinterestAnalyticsPanel data={currentPinterest} syncing={syncingPinterest} onSync={syncPinterest} />}
    {section === "traffic" && <TrafficPanel data={traffic?.period===period?traffic:null} onSave={saveTraffic} saving={savingTraffic} />}
    {section === "advertising" && <AdvertisingPanel data={advertising?.period===period?advertising:null} />}
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
    <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <MetricTile label="Activos" value={counts?.active == null ? "--" : formatCount(counts.active)} context="Estado actual" icon={ShoppingBag} tone="green" />
      <MetricTile label="Borradores" value={counts?.draft == null ? "--" : formatCount(counts.draft)} context="Estado actual" icon={PackageCheck} />
      <MetricTile label="Inactivos" value={counts?.inactive == null ? "--" : formatCount(counts.inactive)} context="Estado actual" icon={CircleAlert} />
      <MetricTile label="Pendientes de renovación" value={catalog?.renewalPending == null ? "--" : formatCount(catalog.renewalPending)}
        context="Vencidos; no incluye agotados" icon={RefreshCw} tone="gold" title="Listings con estado expired en Etsy. No realiza renovaciones." />
      <MetricTile label="Agotados" value={counts?.soldOut == null ? "--" : formatCount(counts.soldOut)} context="Estado sold_out separado" icon={PackageCheck} />
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
