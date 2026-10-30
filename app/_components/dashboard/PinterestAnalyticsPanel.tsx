"use client"

import { useMemo, useState } from "react"
import Image from "next/image"
import { ArrowUpRight, BarChart3, Eye, MousePointer2, Pin, RefreshCw, Search, TrendingUp } from "lucide-react"
import type { getPinterestSnapshot } from "@/lib/dashboard/pinterest-analytics"
import { MetricTile, SectionHeading } from "./DashboardPrimitives"

export type PinterestSnapshot = ReturnType<typeof getPinterestSnapshot>
type Metric = "impressions" | "saves" | "pinClicks" | "outboundClicks" | "engagements"
const metrics: Array<{key:Metric;label:string}> = [
  {key:"impressions",label:"Impresiones"},{key:"outboundClicks",label:"Clics salientes"},
  {key:"saves",label:"Guardados"},{key:"pinClicks",label:"Clics en pin"},{key:"engagements",label:"Interacciones"},
]
const count = (value: number | null | undefined) => value == null ? "--" : new Intl.NumberFormat("es-ES").format(value)
const thumb = (value: string | null) => {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" && url.hostname === "i.pinimg.com" ? url.toString() : null }
  catch { return null }
}

export function PinterestAnalyticsPanel({ data, syncing, onSync }: { data: PinterestSnapshot | null; syncing: boolean; onSync: () => void }) {
  const [metric,setMetric] = useState<Metric>("impressions")
  const [day,setDay] = useState<string | null>(null)
  const [search,setSearch] = useState("")
  const [sort,setSort] = useState<Metric>("impressions")
  const pins = useMemo(() => [...(data?.pins ?? [])].filter((pin) => `${pin.title ?? ""} ${pin.id} ${pin.listingId ?? ""}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => (b[sort] ?? -1) - (a[sort] ?? -1)),[data,search,sort])
  const maximum = Math.max(1,...(data?.daily ?? []).map((item) => item[metric] ?? 0))
  const state = !data ? "Cargando caché" : !data.connected ? "Pinterest sin conectar" : !data.authorized ? "Permisos de lectura insuficientes" :
    data.status === "failed" ? `Falló la última sincronización (${data.errorCode ?? "error"}); se conservan los datos anteriores` :
    data.status === "running" ? "Sincronizando" : data.coverage === "stale" ? "Datos del período anterior; sincroniza para actualizar" :
    data.coverage === "none" ? "Sin datos para este período" : data.status === "partial" ? "Datos parciales" : "Datos sincronizados"
  return <div className="space-y-7">
    <SectionHeading eyebrow="PINTEREST / ANALÍTICA" title="Rendimiento orgánico" description="Datos de Pinterest API. Clics salientes no equivalen a visitas verificadas en Etsy ni a ventas atribuidas."
      action={<div className="flex flex-wrap gap-2">
        {data && (!data.connected || !data.authorized || data.errorCode === "authentication_expired" || data.errorCode === "permission_or_account_denied") &&
          <a href="/api/pinterest/auth/start" className="inline-flex items-center gap-1 rounded border border-[#eeba2b]/40 px-3 py-2 text-xs text-[#f1cc61] hover:bg-[#eeba2b]/10">{data.connected ? "Reautorizar" : "Conectar Pinterest"}<ArrowUpRight size={14}/></a>}
        <button type="button" onClick={onSync} disabled={syncing || !data?.authorized} className="inline-flex items-center gap-2 rounded border border-white/15 px-3 py-2 text-xs text-neutral-200 hover:border-[#eeba2b]/50 disabled:opacity-40"><RefreshCw size={14} className={syncing?"animate-spin":""}/> Sincronizar</button>
      </div>}/>
    <p className="text-xs text-neutral-400" role="status">{state}{data?.lastSuccessAt ? ` · Última actualización: ${new Intl.DateTimeFormat("es-ES",{dateStyle:"medium",timeStyle:"short"}).format(new Date(data.lastSuccessAt))}` : ""}</p>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <MetricTile label="Impresiones" value={count(data?.totals?.impressions)} context="Veces en pantalla" icon={Eye}/>
      <MetricTile label="Guardados" value={count(data?.totals?.saves)} context="Guardados en tableros" icon={Pin}/>
      <MetricTile label="Clics salientes" value={count(data?.totals?.outboundClicks)} context="Acciones hacia destinos externos" icon={ArrowUpRight} tone="gold"/>
      <MetricTile label="Interacciones" value={count(data?.totals?.engagements)} context="Definición de Pinterest" icon={MousePointer2}/>
      <MetricTile label="Tasa de interacción" value={data?.totals?.engagementRate == null ? "--" : `${(data.totals.engagementRate*100).toFixed(1)} %`} context="Interacciones / impresiones" icon={TrendingUp}/>
    </div>
    <section className="border-t border-white/10 pt-5">
      <SectionHeading eyebrow="EVOLUCIÓN UTC" title="Actividad diaria"/>
      <div className="mt-4 flex flex-wrap gap-1" role="group" aria-label="Métrica de evolución">{metrics.map(item=><button key={item.key} type="button" onClick={()=>setMetric(item.key)} aria-pressed={metric===item.key} className={`rounded px-2.5 py-1.5 text-xs ${metric===item.key?"bg-[#eeba2b] text-[#16130a]":"border border-white/10 text-neutral-400 hover:text-white"}`}>{item.label}</button>)}</div>
      {data?.daily.length ? <><div className="mt-4 flex h-40 items-end gap-px border-b border-white/10 pb-1" role="group" aria-label="Evolución diaria de Pinterest">
        {data.daily.map(item=><button key={item.day} type="button" onClick={()=>setDay(item.day)} title={`${item.day}: ${count(item[metric])}`} aria-label={`${item.day}: ${count(item[metric])} ${metric}`} aria-pressed={day===item.day}
          className={`min-w-[4px] flex-1 rounded-t-sm focus-visible:outline-2 focus-visible:outline-[#eeba2b] ${day===item.day?"bg-[#f5d77a]":"bg-[#eeba2b]/65 hover:bg-[#eeba2b]"}`}
          style={{height:`${item[metric] == null ? 3 : Math.max(4,item[metric]!/maximum*100)}%`}} />)}</div>
        <p className="mt-2 text-xs text-neutral-400">{day ? `${day}: ${count(data.daily.find(item=>item.day===day)?.[metric])} ${metrics.find(item=>item.key===metric)?.label.toLowerCase()}` : `${data.daily[0].day} a ${data.daily.at(-1)?.day} · días devueltos por Pinterest`}</p></>
        : <p className="mt-4 text-sm text-neutral-500">No hay serie diaria verificada para este período.</p>}
    </section>
    <section className="border-t border-white/10 pt-5"><SectionHeading eyebrow="TOP 50 / NO CATÁLOGO COMPLETO" title="Pines destacados" description="Pinterest limita esta consulta a 50 pines creados recientemente. No es un ranking de todos los pines de la cuenta."/>
      <div className="mt-4 flex flex-wrap gap-2"><label className="relative max-w-xs flex-1"><Search size={15} className="absolute left-3 top-2.5 text-neutral-500"/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar pin o listing" aria-label="Buscar pines" className="w-full rounded border border-white/15 bg-[#182229] py-2 pl-9 pr-3 text-sm text-white"/></label><select value={sort} onChange={event=>setSort(event.target.value as Metric)} aria-label="Ordenar pines" className="rounded border border-white/15 bg-[#182229] px-3 py-2 text-sm text-white">{metrics.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></div>
      {pins.length ? <div className="mt-3 max-h-[440px] overflow-auto divide-y divide-white/10 border-y border-white/10">{pins.map(item=><div key={item.id} className="flex items-center gap-3 py-3 text-xs">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-white/5">{thumb(item.imageUrl) && <Image src={thumb(item.imageUrl)!} width={48} height={48} unoptimized alt="" className="h-full w-full object-cover"/>}</div>
        <div className="min-w-0 flex-1"><p className="truncate font-medium text-neutral-200">{item.title || `Pin ${item.id}`}</p><p className="mt-1 text-neutral-500">ID {item.id} · Tablero {item.boardId || "--"}{item.listingId ? ` · Etsy ${item.listingId}` : ""}</p></div>
        <div className="hidden gap-4 text-right sm:flex"><span title="Impresiones">{count(item.impressions)} imp.</span><span title="Guardados">{count(item.saves)} guard.</span><span title="Clics salientes">{count(item.outboundClicks)} sal.</span></div>
        <a href={`https://www.pinterest.com/pin/${item.id}/`} target="_blank" rel="noopener noreferrer" aria-label={`Ver pin ${item.id} en Pinterest`} className="text-amber-300"><ArrowUpRight size={16}/></a>
      </div>)}</div> : <p className="mt-4 text-sm text-neutral-500">{data?.topCoverage==="not_current"?"Sin top de pines sincronizado para este período.":"No hay pines en esta selección."}</p>}
      {!data?.pinsComplete && <p className="mt-2 text-xs text-amber-200">Metadatos de pines parciales; algunos títulos o tableros pueden faltar.</p>}
    </section>
    <section className="border-t border-white/10 pt-5"><SectionHeading eyebrow="PINTEREST + ETSY" title="Productos vinculados" description="Solo IDs de listing verificados en la URL de destino. Son métricas de pines del top 50, no ventas atribuidas."/>
      {data?.linked.length ? <div className="mt-3 divide-y divide-white/10 border-y border-white/10">{data.linked.map(item=><div key={item.listingId} className="flex flex-wrap justify-between gap-3 py-3 text-xs"><span>Listing {item.listingId}</span><span>{item.pinCount} pines · {count(item.impressions)} impresiones · {count(item.outboundClicks)} clics salientes</span></div>)}</div> : <p className="mt-4 text-sm text-neutral-500">Sin vínculos Etsy dentro del top sincronizado.</p>}
      <p className="mt-2 text-xs text-neutral-500"><BarChart3 size={13} className="mr-1 inline"/>No se muestran estadísticas por tablero: la muestra de 50 pines no cubre todos sus contenidos.</p>
    </section>
  </div>
}
