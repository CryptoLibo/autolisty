"use client"

import { useState } from "react"
import { ArrowUpRight, Eye, Megaphone, Wallet } from "lucide-react"
import type { advertisingSnapshot } from "@/lib/dashboard/advertising"
import type { trafficSnapshot } from "@/lib/dashboard/etsy-traffic"
import { MetricTile, SectionHeading } from "./DashboardPrimitives"

export type AdvertisingData = ReturnType<typeof advertisingSnapshot>
export type TrafficData = ReturnType<typeof trafficSnapshot>
const number = (value: number | null | undefined) => value == null ? "--" : new Intl.NumberFormat("es-ES").format(value)
const fields = [{key:"visits",label:"Visitas de tienda"},{key:"listingViews",label:"Vistas de listings"},
  {key:"etsySearchVisits",label:"Etsy Search"},{key:"etsyAdsVisits",label:"Etsy Ads"},
  {key:"socialVisits",label:"Redes sociales"},{key:"pinterestVisits",label:"Pinterest (dentro de redes)"}] as const
type Field = typeof fields[number]["key"]

export function TrafficPanel({data,onSave,saving}:{data:TrafficData|null;onSave:(values:Record<Field,string>)=>Promise<void>;saving:boolean}) {
  const [editing,setEditing]=useState(false)
  const [values,setValues]=useState<Record<Field,string>>({visits:"",listingViews:"",etsySearchVisits:"",etsyAdsVisits:"",socialVisits:"",pinterestVisits:""})
  const record=data?.observation
  return <div className="space-y-7">
    <SectionHeading eyebrow="ETSY / SHOP STATS" title="Tráfico de la tienda" description={data ? `Período ${data.from} a ${data.to} (UTC). Origen: cifras transcritas de Shop Stats por el propietario.` : "Cargando observación."}
      action={<button type="button" onClick={()=>setEditing(value=>!value)} className="border border-white/15 px-3 py-2 text-xs text-[#eeba2b]">{editing?"Cerrar":"Registrar cifras"}</button>}/>
    {record ? <><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricTile label="Visitas" value={number(record.visits)} context="Sesiones según Shop Stats" icon={Eye} tone="gold"/>
      <MetricTile label="Vistas de listings" value={number(record.listingViews)} context="No equivalen a visitas" icon={Eye}/>
      <MetricTile label="Etsy Search" value={number(record.etsySearchVisits)} context="Visitas registradas" icon={ArrowUpRight}/>
      <MetricTile label="Pinterest" value={number(record.pinterestVisits)} context="Subconjunto de tráfico social" icon={ArrowUpRight}/>
    </div><p className="text-xs text-neutral-500">Capturado {new Date(record.capturedAt).toLocaleString("es-ES")}. Etsy Ads: {number(record.etsyAdsVisits)} · Redes sociales: {number(record.socialVisits)}.</p></>
      : <p className="border-y border-white/10 py-6 text-sm text-neutral-400">Sin observación de Shop Stats para este período exacto.</p>}
    {editing && <form onSubmit={async event=>{event.preventDefault();try {await onSave(values);setEditing(false)} catch { /* Parent displays the error. */ }}} className="border-t border-white/10 pt-5">
      <p className="mb-4 text-xs text-neutral-400">En Etsy Shop Manager &gt; Stats, selecciona el mismo intervalo en UTC. Deja vacías las fuentes que Etsy no desglose. Guardar sustituye la observación anterior de este intervalo.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{fields.map(field=><label key={field.key} className="text-xs text-neutral-400">{field.label}<input type="number" min="0" step="1" required={field.key==="visits"} value={values[field.key]} onChange={event=>setValues(current=>({...current,[field.key]:event.target.value}))}
        className="mt-1 block w-full border border-white/15 bg-[#182229] px-3 py-2 text-sm text-white"/></label>)}</div>
      <button type="submit" disabled={saving} className="mt-4 bg-[#eeba2b] px-4 py-2 text-xs font-semibold text-black disabled:opacity-40">{saving?"Guardando...":"Guardar observación"}</button>
    </form>}
  </div>
}

export function AdvertisingPanel({data}:{data:AdvertisingData|null}) {
  const [currency,setCurrency]=useState<string>("")
  const currencies=[...new Set(data?.spend.map(item=>item.currency) ?? [])]
  const active=currencies.includes(currency)?currency:currencies[0]
  const rows=data?.spend.filter(item=>item.currency===active) ?? []
  const amount=(channel:string)=>{const matching=rows.filter(item=>item.channel===channel);return matching.length?matching.reduce((sum,item)=>sum+item.amountMinor,0):null}
  const money=(minor:number)=>active ? new Intl.NumberFormat("es-ES",{style:"currency",currency:active}).format(minor/100) : "--"
  return <div className="space-y-7">
    <SectionHeading eyebrow="PUBLICIDAD / GASTO VERIFICADO" title="Inversión publicitaria" description="Cargos del extracto Etsy y gastos manuales no conciliados; los registros conciliados se cuentan una sola vez. No son métricas de campaña."
      action={currencies.length>1?<select value={active} onChange={event=>setCurrency(event.target.value)} aria-label="Moneda publicitaria" className="border border-white/15 bg-[#182229] px-3 py-2 text-xs">{currencies.map(item=><option key={item}>{item}</option>)}</select>:undefined}/>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <MetricTile label="Marketing sin asignar" value={amount("unallocated")==null?"--":money(amount("unallocated")!)} context="Cargo del extracto Etsy" icon={Wallet} tone="gold"/>
      <MetricTile label="Etsy Ads" value={amount("etsy_ads")==null?"--":money(amount("etsy_ads")!)} context="Gasto manual sin conciliar" icon={Megaphone}/>
      <MetricTile label="Pinterest Ads" value={amount("pinterest_ads")==null?"--":money(amount("pinterest_ads")!)} context="Gasto manual sin conciliar" icon={Megaphone}/>
    </div>
    <section className="border-t border-white/10 pt-5"><SectionHeading eyebrow="COBERTURA" title="Rendimiento de anuncios"/>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">No hay impresiones, clics, CPC, CTR ni ingresos atribuidos de campañas en las conexiones actuales. El importe Marketing del CSV no identifica Etsy Ads frente a otros cargos y permanece sin asignar. No se suman monedas distintas ni se calcula ROAS con ingresos generales de la tienda.</p>
    </section>
  </div>
}
