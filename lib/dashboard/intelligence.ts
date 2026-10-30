import type Database from "better-sqlite3"
import { getCatalogSnapshot } from "./etsy-catalog"
import { getSalesSnapshot } from "./etsy-sales"
import { getPinterestSnapshot } from "./pinterest-analytics"
import { trafficSnapshot } from "./etsy-traffic"
import { advertisingSnapshot } from "./advertising"
import { getDashboardOverview, type DashboardPeriod } from "./overview"

export const INTELLIGENCE_RULES = {
  staleHours: 36,
  salesDropMinimumPrior: 3,
  salesDropMinimumAbsolute: 2,
  salesDropFraction: 0.4,
  notableProductUnits: 2,
  pinterestOutboundMinimum: 5,
  pinterestDropMinimumPrior: 20,
  pinterestDropFraction: 0.4,
  registeredSpendMinimumPriorMinor: 1000,
  registeredSpendIncreaseMinor: 1000,
} as const

export type SourceState = "available" | "partial" | "stale" | "not_configured" | "error"
export type Decision = { id:string; category:"operations"|"sales"|"finance"|"pinterest";
  kind:"alert"|"opportunity"; priority:"urgent"|"review"|"consider";
  title:string; evidence:string; limitation:string; action:string;
  section:"sales"|"costs"|"traffic"|"advertising"|"pinterest"|"operations";
  source:string; period:DashboardPeriod }
type ProductRow = { listingId:number; title:string|null; state:string|null; units:number; currency:string|null;
  lineTotal:number|null; priorUnits:number; pinterestOutbound:number|null; pinterestImpressions:number|null }
const ageHours=(value:string|null|undefined,now:Date)=>value?Math.max(0,(now.getTime()-Date.parse(value))/3_600_000):Infinity
const state=(connected:boolean,last:string|null|undefined,status:string|undefined,now:Date,complete=true):SourceState=>
  !connected?"not_configured":status==="failed"?"error":!last?"partial":ageHours(last,now)>INTELLIGENCE_RULES.staleHours?"stale":
    status==="partial"||!complete?"partial":"available"
export function comparableChange(current:number,previous:number) {
  return previous===0?{difference:current,percent:null,comparison:"no_prior_activity" as const}:
    {difference:current-previous,percent:(current-previous)/previous,comparison:"comparable" as const}
}
function window(period:DashboardPeriod,now:Date) {
  const days=Number.parseInt(period,10)
  const current=Math.floor(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-days+1)/1000)
  return {current,prior:current-days*86400,end:Math.floor(now.getTime()/1000)+1,
    fromDay:new Date(current*1000).toISOString().slice(0,10),priorDay:new Date((current-days*86400)*1000).toISOString().slice(0,10),
    toDay:now.toISOString().slice(0,10)}
}
function products(db:Database.Database,shopId:number,period:DashboardPeriod,now:Date,withCatalog:boolean,withPinterest:boolean):ProductRow[] {
  const w=window(period,now)
  const rows=db.prepare(`SELECT t.listing_id AS listingId,
    SUM(CASE WHEN r.created_timestamp>=? THEN t.quantity ELSE 0 END) AS units,
    SUM(CASE WHEN r.created_timestamp<? THEN t.quantity ELSE 0 END) AS priorUnits,
    t.currency_code AS currency,
    SUM(CASE WHEN r.created_timestamp>=? AND t.price_divisor>0 THEN t.price_amount*t.quantity*1.0/t.price_divisor ELSE 0 END) AS lineTotal,
    SUM(CASE WHEN r.created_timestamp>=? AND (t.price_amount IS NULL OR t.price_divisor IS NULL OR t.price_divisor<=0) THEN 1 ELSE 0 END) AS missingPrice
    FROM dashboard_etsy_transactions t JOIN dashboard_etsy_receipts r ON r.shop_id=t.shop_id AND r.receipt_id=t.receipt_id
    WHERE t.shop_id=? AND r.status IN ('paid','completed') AND r.created_timestamp>=? AND r.created_timestamp<?
      AND t.listing_id IS NOT NULL
    GROUP BY t.listing_id,t.currency_code ORDER BY units DESC LIMIT 40`)
    .all(w.current,w.current,w.current,w.current,shopId,w.prior,w.end) as Array<{
      listingId:number;units:number;priorUnits:number;currency:string|null;lineTotal:number;missingPrice:number }>
  const listing=db.prepare("SELECT title,state FROM dashboard_etsy_listings WHERE shop_id=? AND listing_id=?")
  const pin=db.prepare(`SELECT SUM(t.outbound_clicks) AS outbound,SUM(t.impressions) AS impressions
    FROM dashboard_pinterest_pins p JOIN dashboard_pinterest_top_pins t ON t.pin_id=p.pin_id
    JOIN dashboard_pinterest_top_sync s ON s.account_id=t.account_id AND s.period=t.period
    WHERE p.listing_id=? AND t.period=? AND s.coverage_from=? AND s.coverage_to=?`)
  return rows.filter(row=>row.units>0||row.priorUnits>0).slice(0,12).map(row=>{
    const details=withCatalog?listing.get(shopId,row.listingId) as {title:string;state:string}|undefined:undefined
    const metrics=withPinterest?pin.get(row.listingId,period,w.fromDay,w.toDay) as {outbound:number|null;impressions:number|null}:undefined
    return {listingId:row.listingId,title:details?.title??null,state:details?.state??null,units:row.units,
      priorUnits:row.priorUnits,currency:row.currency,lineTotal:row.missingPrice?null:row.lineTotal,
      pinterestOutbound:metrics?.outbound??null,pinterestImpressions:metrics?.impressions??null}
  })
}
function quietProducts(db:Database.Database,shopId:number,period:DashboardPeriod,now:Date) {
  const w=window(period,now)
  return db.prepare(`SELECT l.listing_id AS listingId,l.title
    FROM dashboard_etsy_listings l LEFT JOIN (
      SELECT DISTINCT t.shop_id,t.listing_id FROM dashboard_etsy_receipts r
      JOIN dashboard_etsy_transactions t ON t.shop_id=r.shop_id AND t.receipt_id=r.receipt_id
      WHERE r.shop_id=? AND r.status IN ('paid','completed') AND r.created_timestamp>=? AND r.created_timestamp<?
    ) sold ON sold.shop_id=l.shop_id AND sold.listing_id=l.listing_id
    WHERE l.shop_id=? AND l.state='active' AND sold.listing_id IS NULL
    ORDER BY l.created_timestamp DESC,l.listing_id DESC LIMIT 4`).all(shopId,w.current,w.end,shopId) as Array<{listingId:number;title:string}>
}
function pinterestComparison(db:Database.Database,period:DashboardPeriod,now:Date) {
  if(period==="90d") return null
  const sync=db.prepare("SELECT account_id FROM dashboard_pinterest_sync WHERE last_success_at IS NOT NULL ORDER BY last_success_at DESC LIMIT 1").get() as {account_id:string}|undefined
  if(!sync) return null
  const w=window(period,now),days=Number.parseInt(period,10)
  const rows=db.prepare(`SELECT day,impressions,outbound_clicks AS outboundClicks FROM dashboard_pinterest_daily
    WHERE account_id=? AND day>=? AND day<=? ORDER BY day`)
    .all(sync.account_id,w.priorDay,w.toDay) as Array<{day:string;impressions:number|null;outboundClicks:number|null}>
  if(rows.length!==days*2||rows.some(row=>row.impressions===null||row.outboundClicks===null)) return null
  const prior=rows.filter(row=>row.day<w.fromDay),current=rows.filter(row=>row.day>=w.fromDay)
  if(prior.length!==days||current.length!==days) return null
  return {impressions:{current:current.reduce((sum,row)=>sum+row.impressions!,0),previous:prior.reduce((sum,row)=>sum+row.impressions!,0)},
    outboundClicks:{current:current.reduce((sum,row)=>sum+row.outboundClicks!,0),previous:prior.reduce((sum,row)=>sum+row.outboundClicks!,0)}}
}

export function getBusinessIntelligence(db:Database.Database,period:DashboardPeriod,
  access:{etsyConnected:boolean;etsySalesAuthorized:boolean;pinterestConnected:boolean;pinterestAuthorized:boolean},now=new Date()) {
  const errors:string[]=[]
  const read=<T>(source:string,fn:()=>T):T|null=>{try{return fn()}catch{errors.push(source);return null}}
  const catalog=read("catalog",()=>getCatalogSnapshot(db,period,access.etsyConnected,now))
  const sales=read("sales",()=>getSalesSnapshot(db,period,access.etsyConnected,access.etsySalesAuthorized,now))
  const pinterest=read("pinterest",()=>getPinterestSnapshot(db,period,access.pinterestConnected,access.pinterestAuthorized,now))
  const traffic=read("traffic",()=>trafficSnapshot(db,period,now))
  const advertising=read("advertising",()=>advertisingSnapshot(db,period,now))
  const operations=read("operations",()=>getDashboardOverview(db,period,now))
  const finance=read("finance",()=>{
    const w=window(period,now)
    const unreviewed=db.prepare(`SELECT COUNT(*) AS count FROM finance_expenses e WHERE e.status='active'
      AND NOT EXISTS (SELECT 1 FROM finance_reconciliations r WHERE r.expense_id=e.id)`).get() as {count:number}
    const imports=db.prepare("SELECT COUNT(*) AS count FROM finance_csv_imports WHERE status='active'").get() as {count:number}
    const rejected=db.prepare("SELECT COUNT(*) AS count FROM finance_csv_imports WHERE status='active' AND rejected_count>0").get() as {count:number}
    const rows=db.prepare(`SELECT currency,
      SUM(CASE WHEN occurred_on>=? AND occurred_on<=? AND net_minor<0 THEN -net_minor ELSE 0 END) AS currentMinor,
      SUM(CASE WHEN occurred_on>=? AND occurred_on<? AND net_minor<0 THEN -net_minor ELSE 0 END) AS priorMinor
      FROM finance_csv_rows WHERE status='active' AND occurred_on>=? AND occurred_on<=? GROUP BY currency`)
      .all(w.fromDay,w.toDay,w.priorDay,w.fromDay,w.priorDay,w.toDay) as Array<{currency:string;currentMinor:number;priorMinor:number}>
    return {unreviewed:unreviewed.count,imports:imports.count,rejected:rejected.count,registeredDeductions:rows}
  })
  const coverage={
    catalog:catalog?state(access.etsyConnected,catalog.lastSuccessAt,catalog.status,now,catalog.detailsComplete):"error" as SourceState,
    sales:sales?state(access.etsyConnected&&access.etsySalesAuthorized,sales.lastSuccessAt,sales.status,now,sales.complete):"error" as SourceState,
    finance:finance?(finance.imports||finance.unreviewed?"partial":"not_configured") as SourceState:"error" as SourceState,
    traffic:traffic?(traffic.observation?"partial":"not_configured") as SourceState:"error" as SourceState,
    pinterest:pinterest?state(access.pinterestConnected&&access.pinterestAuthorized,pinterest.lastSuccessAt,pinterest.status,now,pinterest.coverage==="current"):"error" as SourceState,
    operations:operations?"available" as SourceState:"error" as SourceState,
  }
  const reliableSales=Boolean(sales?.complete&&coverage.sales==="available")
  const reliableCatalog=Boolean(catalog?.detailsComplete&&coverage.catalog==="available")
  const productRows=reliableSales&&sales?.productReady?read("products",()=>{
    const sync=db.prepare("SELECT shop_id FROM dashboard_etsy_sales_sync WHERE last_success_at IS NOT NULL ORDER BY last_success_at DESC LIMIT 1").get() as {shop_id:number}|undefined
    return sync?products(db,sync.shop_id,period,now,reliableCatalog,coverage.pinterest==="available"):[]
  }) ?? []:[]
  const shop=read("shop",()=>db.prepare("SELECT shop_id FROM dashboard_etsy_sales_sync WHERE last_success_at IS NOT NULL ORDER BY last_success_at DESC LIMIT 1").get() as {shop_id:number}|undefined)
  const quiet=reliableSales&&reliableCatalog&&shop?read("quiet_products",()=>quietProducts(db,shop.shop_id,period,now))??[]:[]
  const decisions:Decision[]=[]
  const add=(item:Decision)=>{if(!decisions.some(existing=>existing.id===item.id))decisions.push(item)}
  const make=(id:string,category:Decision["category"],kind:Decision["kind"],priority:Decision["priority"],title:string,
    evidence:string,limitation:string,action:string,section:Decision["section"],source:string):Decision=>
    ({id,category,kind,priority,title,evidence,limitation,action,section,source,period})
  if (operations?.attention) add(make("blocked_jobs","operations","alert","urgent","Trabajos que requieren atención",
    `${operations.attention} trabajos creados en este período están en estado de atención.`,"El estado actual puede haber cambiado desde la consulta.",
    "Revisar y desbloquear trabajos","operations","Automation"))
  const soldExpired=productRows.find(product=>product.state==="expired"&&product.units+product.priorUnits>0)
  if (catalog?.renewalPending&&reliableCatalog) add(make("expired_listings","operations","alert","urgent",
    soldExpired?"Listing vencido con historial comercial":"Listings vencidos",
    soldExpired?`El listing ${soldExpired.listingId} está vencido y registró ${soldExpired.units+soldExpired.priorUnits} unidades en los dos períodos comparados.`:
      `${catalog.renewalPending} listings vencidos en el catálogo sincronizado.`,"No se renuevan automáticamente; el historial no garantiza ventas futuras.",
    "Revisar los listings vencidos","sales","Etsy catálogo"))
  for (const [key,label,section] of [["catalog","catálogo","sales"],["sales","pedidos","sales"],["pinterest","Pinterest","pinterest"]] as const) {
    if (coverage[key]==="error"||coverage[key]==="stale") add(make(`sync_${key}`,"operations","alert","review",`Revisar sincronización de ${label}`,
      coverage[key]==="error"?`La última sincronización de ${label} falló.`:`La última sincronización de ${label} tiene más de ${INTELLIGENCE_RULES.staleHours} horas.`,
      "Los datos anteriores pueden seguir disponibles, pero no respaldan cambios actuales.","Abrir la fuente y actualizar",section,`Sincronización ${label}`))
  }
  if (finance?.rejected) add(make("finance_imports","finance","alert","review","Importaciones con filas rechazadas",
    `${finance.rejected} importaciones activas contienen filas rechazadas.`,"La cobertura financiera sigue siendo parcial.",
    "Revisar las importaciones","costs","Finanzas"))
  if (finance?.unreviewed) add(make("unreviewed_expenses","finance","alert","review","Gastos sin conciliar",
    `${finance.unreviewed} gastos activos aún no están conciliados.`,"No todos requieren necesariamente conciliación con un extracto.",
    "Revisar gastos y movimientos","costs","Finanzas"))
  if(finance?.imports&&finance.registeredDeductions.length===1) {
    const spend=finance.registeredDeductions[0]
    if(spend.priorMinor>=INTELLIGENCE_RULES.registeredSpendMinimumPriorMinor&&
      spend.currentMinor-spend.priorMinor>=INTELLIGENCE_RULES.registeredSpendIncreaseMinor&&
      spend.currentMinor/spend.priorMinor>=1.5)
      add(make("registered_spend_rise","finance","alert","review","Aumentaron las deducciones registradas",
        `${(spend.currentMinor/100).toFixed(2)} ${spend.currency} ahora frente a ${(spend.priorMinor/100).toFixed(2)} ${spend.currency} antes.`,
        "Solo movimientos importados; no representa gastos totales ni beneficio neto.","Revisar movimientos y conciliación","costs","Extracto financiero"))
  }
  const currentPaid=sales?.current?.paid??null,priorPaid=sales?.previous?.paid??null
  const change=reliableSales&&currentPaid!==null&&priorPaid!==null?comparableChange(currentPaid,priorPaid):null
  const currentMoney=sales?.current?.currencies,priorMoney=sales?.previous?.currencies
  const currencyKeys=currentMoney&&priorMoney?[...new Set([...Object.keys(currentMoney),...Object.keys(priorMoney)])]:[]
  const orderValue=reliableSales&&sales?.current?.financialComplete&&sales?.previous?.financialComplete&&currencyKeys.length===1?
    {currency:currencyKeys[0],current:currentMoney?.[currencyKeys[0]]?.orderTotal??0,
      previous:priorMoney?.[currencyKeys[0]]?.orderTotal??0}:null
  if (change?.comparison==="comparable"&&priorPaid!==null&&priorPaid>=INTELLIGENCE_RULES.salesDropMinimumPrior&&
    change.difference<=-INTELLIGENCE_RULES.salesDropMinimumAbsolute&&change.percent!==null&&change.percent<=-INTELLIGENCE_RULES.salesDropFraction)
    add(make("sales_drop","sales","alert","review","Menos pedidos pagados que antes",
      `${currentPaid} ahora frente a ${priorPaid} en el período anterior de igual duración.`,
      "La comparación no identifica la causa.","Examinar ventas y listings","sales","Etsy pedidos"))
  const pinTrend=coverage.pinterest==="available"?read("pinterest_trend",()=>pinterestComparison(db,period,now)):null
  if(pinTrend?.impressions.previous&&pinTrend.impressions.previous>=INTELLIGENCE_RULES.pinterestDropMinimumPrior&&
    pinTrend.impressions.current/pinTrend.impressions.previous<=1-INTELLIGENCE_RULES.pinterestDropFraction)
    add(make("pinterest_impressions_drop","pinterest","alert","review","Cayeron las impresiones de Pinterest",
      `${pinTrend.impressions.current} ahora frente a ${pinTrend.impressions.previous} en la ventana anterior.`,
      "Solo orgánico y días completos; no identifica la causa ni atribuye ventas.","Examinar pines destacados","pinterest","Pinterest Analytics"))
  for (const product of productRows) {
    if (product.units>=INTELLIGENCE_RULES.notableProductUnits&&product.units>product.priorUnits)
      add(make(`product_growth_${product.listingId}`,"sales","opportunity","consider","Producto con actividad destacada",
        `${product.units} unidades ahora y ${product.priorUnits} en el período anterior; listing ${product.listingId}.`,
        "Una subida reciente no predice demanda futura.","Evaluar variantes o mejorar el listing","sales","Etsy pedidos"))
    if (product.pinterestOutbound!==null&&product.pinterestOutbound>=INTELLIGENCE_RULES.pinterestOutboundMinimum)
      add(make(`pin_interest_${product.listingId}`,"pinterest","opportunity","consider","Interés en Pinterest para un listing",
        `${product.pinterestOutbound} clics salientes en pines vinculados al listing ${product.listingId} dentro del top disponible.`,
        "No son visitas ni ventas atribuidas; el top no cubre todos los pines.","Revisar los pines y su destino","pinterest","Pinterest Analytics"))
  }
  if(coverage.pinterest==="available") for(const link of pinterest?.linked??[]) {
    if(link.outboundClicks!==null&&link.outboundClicks>=INTELLIGENCE_RULES.pinterestOutboundMinimum&&
      !decisions.some(item=>item.id===`pin_interest_${link.listingId}`))
      add(make(`pin_interest_${link.listingId}`,"pinterest","opportunity","consider","Interés en Pinterest para un listing",
        `${link.outboundClicks} clics salientes en ${link.pinCount} pines vinculados al listing ${link.listingId} dentro del top disponible.`,
        "No son visitas ni ventas atribuidas; el top no cubre todos los pines.","Revisar los pines y su destino","pinterest","Pinterest Analytics"))
  }
  const priority={urgent:0,review:1,consider:2}
  decisions.sort((a,b)=>priority[a.priority]-priority[b.priority]||a.id.localeCompare(b.id))
  const summary=reliableSales&&change?.comparison==="comparable"&&currentPaid!==null&&priorPaid!==null?
    currentPaid>priorPaid?`Los pedidos pagados subieron de ${priorPaid} a ${currentPaid} frente al período anterior.`:
    currentPaid<priorPaid?`Los pedidos pagados bajaron de ${priorPaid} a ${currentPaid} frente al período anterior.`:
    `Los pedidos pagados se mantuvieron en ${currentPaid} frente al período anterior.`:
    "Evaluación parcial: faltan períodos comparables de pedidos o fuentes actualizadas."
  return {period,asOf:now.toISOString(),summary,coverage,change,orders:reliableSales?{current:currentPaid,previous:priorPaid}:null,
    orderValue,registeredDeductions:finance?.registeredDeductions??[],
    products:productRows.slice(0,6),quietProducts:quiet,decisions:decisions.slice(0,12),errors,
    financialCoverage:"partial" as const,trafficCaptured:traffic?.observation?.capturedAt??null,
    advertisingSpend:advertising?.spend??[]}
}
