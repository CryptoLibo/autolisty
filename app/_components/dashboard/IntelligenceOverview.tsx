"use client"

import { useState } from "react"
import { ArrowRight, ChevronDown, CircleAlert, Compass, Database, TrendingDown, TrendingUp } from "lucide-react"
import type { getBusinessIntelligence, Decision, SourceState } from "@/lib/dashboard/intelligence"
import { SectionHeading } from "./DashboardPrimitives"

export type Intelligence = ReturnType<typeof getBusinessIntelligence>
type Destination = Decision["section"]
const coverageLabel:Record<SourceState,string>={available:"Disponible",partial:"Parcial",stale:"Desactualizada",not_configured:"Sin datos",error:"Error"}
const sourceLabel:Record<keyof Intelligence["coverage"],string>={catalog:"Catálogo",sales:"Pedidos",finance:"Finanzas",traffic:"Shop Stats",pinterest:"Pinterest",operations:"Automation"}
const priorityLabel={urgent:"Urgente",review:"Revisar",consider:"Considerar"}
function DecisionRow({item,onNavigate}:{item:Decision;onNavigate:(section:Destination)=>void}) {
  const [expanded,setExpanded]=useState(false)
  return <div className="border-b border-white/8 py-3 last:border-0">
    <div className="flex flex-wrap items-start gap-3">
      <span className={`mt-0.5 w-16 shrink-0 text-[10px] font-semibold uppercase ${item.priority==="urgent"?"text-rose-300":item.priority==="review"?"text-amber-300":"text-emerald-300"}`}>{priorityLabel[item.priority]}</span>
      <div className="min-w-0 flex-1"><p className="text-sm font-medium text-neutral-100">{item.title}</p><p className="mt-1 text-xs leading-5 text-neutral-400">{item.evidence}</p></div>
      <button type="button" onClick={()=>setExpanded(value=>!value)} aria-expanded={expanded} aria-label={`Evidencia de ${item.title}`} className="p-1 text-neutral-400 hover:text-white"><ChevronDown size={16} className={expanded?"rotate-180":""}/></button>
    </div>
    {expanded&&<div className="ml-[4.75rem] mt-3 space-y-1 border-l border-white/15 pl-3 text-xs leading-5 text-neutral-400">
      <p>Fuente: {item.source} · Período: {item.period}</p><p>Límite: {item.limitation}</p>
      <button type="button" onClick={()=>onNavigate(item.section)} className="inline-flex items-center gap-1 pt-1 font-medium text-[#eeba2b] hover:text-[#f6d982]">{item.action}<ArrowRight size={13}/></button>
    </div>}
  </div>
}
export function IntelligenceOverview({data,error,onNavigate,onRetry}:{data:Intelligence|null;error:string|null;
  onNavigate:(section:Destination)=>void;onRetry:()=>void}) {
  const [showCoverage,setShowCoverage]=useState(false)
  if (error&&!data) return <div role="alert" className="border-l-2 border-rose-400 py-5 pl-4 text-sm text-rose-200">{error}<button type="button" onClick={onRetry} className="ml-3 text-[#eeba2b] underline">Reintentar</button></div>
  if (!data) return <div className="space-y-4" aria-label="Cargando inteligencia comercial"><div className="h-20 animate-pulse bg-white/5"/><div className="h-40 animate-pulse bg-white/5"/></div>
  const alerts=data.decisions.filter(item=>item.kind==="alert")
  const opportunities=data.decisions.filter(item=>item.kind==="opportunity")
  const complete=Object.values(data.coverage).filter(value=>value==="available").length
  const change=data.change
  return <div className="space-y-8">
    <section className="border-b border-white/10 pb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-[11px] font-semibold uppercase text-[#eeba2b]">LECTURA EJECUTIVA · {data.period}</p>
          <h2 className="mt-2 max-w-3xl text-xl font-semibold leading-snug text-white sm:text-2xl">{data.summary}</h2>
          <p className="mt-2 text-xs text-neutral-400">Actualizado {new Date(data.asOf).toLocaleString("es-ES")} · {complete} de 6 fuentes disponibles; evaluación {complete===6?"completa":"parcial"}.</p></div>
        {data.decisions.length>0&&<button type="button" onClick={()=>document.getElementById("business-priorities")?.scrollIntoView({behavior:"smooth"})}
          className="inline-flex items-center gap-2 border border-[#eeba2b]/40 px-3 py-2 text-xs font-medium text-[#f0c850]">Ver prioridades <ArrowRight size={14}/></button>}
      </div>
    </section>
    <div className="grid gap-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
      <section className="border-t border-white/10 pt-5"><SectionHeading eyebrow="CAMBIO REAL" title="Evolución comercial"/>
        {data.orders&&change ? <div className="mt-4 flex items-center gap-5 border-y border-white/10 py-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-white/10 text-[#eeba2b]">{change.difference<0?<TrendingDown size={20}/>:<TrendingUp size={20}/>}</div>
          <div><p className="text-sm font-medium text-neutral-100">{data.orders.current} pedidos pagados ahora · {data.orders.previous} antes</p>
            <p className="mt-1 text-xs text-neutral-400">{change.comparison==="no_prior_activity"?"Sin actividad en el período anterior; no se calcula porcentaje.":`${change.difference>0?"+":""}${change.difference} pedidos (${change.percent===null?"--":`${Math.round(change.percent*100)} %`}) en intervalos iguales.`}</p></div>
        </div>:<p className="mt-4 text-sm leading-6 text-neutral-400">Todavía no hay dos períodos de pedidos completos y actualizados para una comparación fiable.</p>}
        {data.orderValue&&<div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="border-l-2 border-[#eeba2b] pl-3"><p className="text-xs text-neutral-500">Importe de pedidos ahora</p><p className="mt-1 text-lg font-medium text-white">{new Intl.NumberFormat("es-ES",{style:"currency",currency:data.orderValue.currency}).format(data.orderValue.current)}</p></div>
          <div className="border-l-2 border-white/20 pl-3"><p className="text-xs text-neutral-500">Período anterior</p><p className="mt-1 text-lg font-medium text-neutral-300">{new Intl.NumberFormat("es-ES",{style:"currency",currency:data.orderValue.currency}).format(data.orderValue.previous)}</p></div>
        </div>}
        <p className="mt-3 text-xs text-neutral-500">No se muestra beneficio neto: la cobertura de gastos sigue siendo parcial y las monedas no se mezclan.</p>
      </section>
      <section className="border-t border-white/10 pt-5"><SectionHeading eyebrow="DATOS" title="Cobertura de fuentes" action={<button type="button" onClick={()=>setShowCoverage(value=>!value)} aria-expanded={showCoverage} className="p-1 text-neutral-400" title="Mostrar cobertura"><ChevronDown size={16} className={showCoverage?"rotate-180":""}/></button>}/>
        <div className="mt-4 grid grid-cols-2 gap-2">{Object.entries(data.coverage).map(([key,value])=><div key={key} className="flex items-center justify-between gap-2 border-b border-white/8 py-2 text-xs"><span className="text-neutral-300">{sourceLabel[key as keyof Intelligence["coverage"]]}</span><span className={value==="available"?"text-emerald-300":value==="error"?"text-rose-300":"text-amber-200"}>{coverageLabel[value]}</span></div>)}</div>
        {showCoverage&&<p className="mt-3 text-xs leading-5 text-neutral-500">Finanzas y Shop Stats se consideran parciales incluso con registros: pueden faltar movimientos o fuentes. Una sincronización antigua no sustenta nuevas conclusiones. Errores aislados: {data.errors.length?data.errors.join(", "):"ninguno"}.</p>}
      </section>
    </div>
    <section id="business-priorities" className="border-t border-white/10 pt-5"><SectionHeading eyebrow="PRIMERO LO IMPORTANTE" title="Decisiones pendientes" description="Reglas transparentes. Nada se ejecuta automáticamente."/>
      {alerts.length?<div className="mt-3 border-y border-white/10">{alerts.slice(0,6).map(item=><DecisionRow key={item.id} item={item} onNavigate={onNavigate}/>)}</div>
        :<p className="mt-4 flex items-center gap-2 text-sm text-neutral-400"><CircleAlert size={15}/>Sin alertas verificables para este período. La ausencia de datos no equivale a buen rendimiento.</p>}
    </section>
    <section className="border-t border-white/10 pt-5"><SectionHeading eyebrow="PRODUCTOS" title="Actividad por listing" description="Ventas verificadas; los clics de Pinterest no se atribuyen a pedidos."/>
      {data.products.length?<div className="mt-3 grid gap-x-6 sm:grid-cols-2">{data.products.map(product=><button key={`${product.listingId}-${product.currency}`} type="button" onClick={()=>onNavigate("sales")}
        className="flex min-w-0 items-center justify-between gap-3 border-b border-white/10 py-3 text-left hover:bg-white/[0.03]"><span className="min-w-0"><span className="block truncate text-sm font-medium text-neutral-200">{product.title||`Listing ${product.listingId}`}</span><span className="text-xs text-neutral-500">#{product.listingId}{product.state?` · ${product.state}`:""}</span></span><span className="shrink-0 text-right"><span className="block text-sm text-[#eeba2b]">{product.units} uds.</span><span className="text-xs text-neutral-500">antes {product.priorUnits}</span>{product.lineTotal!==null&&product.currency&&<span className="block text-xs text-neutral-400">{new Intl.NumberFormat("es-ES",{style:"currency",currency:product.currency}).format(product.lineTotal)}</span>}</span></button>)}</div>
        :<p className="mt-4 text-sm text-neutral-400">Se necesitan pedidos con líneas de producto completas y actuales para clasificar listings.</p>}
      {data.quietProducts.length>0&&<div className="mt-4 border-t border-white/8 pt-3"><p className="text-xs font-medium text-neutral-400">Activos sin ventas verificadas en este período</p>
        <p className="mt-1 text-xs leading-5 text-neutral-500">{data.quietProducts.map(item=>item.title||`#${item.listingId}`).join(" · ")}. Esto no determina la calidad ni el potencial del producto.</p></div>}
    </section>
    <section className="border-t border-white/10 pt-5"><SectionHeading eyebrow="OPORTUNIDADES" title="Señales para explorar"/>
      {opportunities.length?<div className="mt-3 border-y border-white/10">{opportunities.slice(0,4).map(item=><DecisionRow key={item.id} item={item} onNavigate={onNavigate}/>)}</div>
        :<p className="mt-4 flex items-center gap-2 text-sm text-neutral-400"><Compass size={15}/>Aún no hay señales suficientes para recomendar una acción por producto.</p>}
    </section>
    <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-4 text-xs text-neutral-400"><Database size={14}/><span>Explorar datos:</span>
      {(["sales","costs","traffic","advertising","pinterest","operations"] as const).map(section=><button key={section} type="button" onClick={()=>onNavigate(section)} className="border border-white/10 px-2 py-1 text-neutral-300 hover:border-[#eeba2b]/50 hover:text-[#eeba2b]">{{sales:"Ventas",costs:"Gastos",traffic:"Tráfico",advertising:"Publicidad",pinterest:"Pinterest",operations:"Operaciones"}[section]}</button>)}
    </div>
  </div>
}
