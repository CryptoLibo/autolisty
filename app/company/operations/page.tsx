"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ExternalLink, RefreshCw, Building2, Boxes, FileText, AlertTriangle, CheckCircle2, Activity } from "lucide-react"
import AgentPortrait from "../office/agent-portrait"
import styles from "./workspace.module.css"

type Operations = {
  counts: { projects: number; units: number; listings: number; running: number; incidents: number; approvedDesigns: number }
  projects: Array<{ id: string; title: string; status: string; created_at: string; units: number }>
  listings: Array<{ id: string; project_id: string; product_code: string | null; status: string; created_at: string; project_title: string; unit_count: number }>
  budget: { total: number; cap: number; remaining: number }
  automation: { available: boolean; mode?: string; counts?: Record<string, number>; jobs?: Array<{ id: string; companyListingId: string | null; productCode: string; productType: string; status: string; lastError: string | null }>; reason?: string }
  roles: Array<{ id: string; name: string; department: string; status: "active" | "consultative" | "planned" | "blocked" }>
  providers: { alura: { configured: boolean; enabled: boolean; credits: { used: number; requests: number }; cap: number }; kittl: { configured: boolean; connected: boolean; enabled: boolean } }
}

export default function OperationsPage() {
  const [data, setData] = useState<Operations | null>(null)
  const [error, setError] = useState("")
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/company/operations", { cache: "no-store" })
      const result = await response.json().catch(() => ({ error: "El servidor no devolvió una respuesta válida." }))
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`)
      setData(result)
      setError("")
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }, [])
  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh() }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])
  const departments = [...new Set(data?.roles.map((role) => role.department) || [])]
  async function connectKittl() {
    try {
      const response = await fetch("/api/company/kittl/start", { method: "POST" })
      const result = await response.json() as { connected?: boolean; url?: string; error?: string }
      if (!response.ok) throw new Error(result.error || "Kittl no respondió.")
      if (result.url) window.location.assign(result.url)
      else if (result.connected) await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  return <main className={styles.shell}>
    <header className={styles.header}><div><Link href="/company" title="Volver a la oficina" aria-label="Volver a la oficina"><ArrowLeft size={18}/></Link><span className={styles.brandMark}>AL</span><div><strong>Autolisty Company</strong><span>OFICINA / OPERACIONES</span></div></div><button title="Actualizar datos" aria-label="Actualizar datos" onClick={refresh}><RefreshCw size={18}/></button></header>
    {error && <p className={styles.error}>{error}</p>}
    {!data ? <p className={styles.loading}>Cargando estado…</p> : <div className={styles.content}>
      <div className={styles.pageHead}><div><span>SEDE CENTRAL / DATOS REALES</span><h1>Centro de operaciones</h1></div><Link href="/company"><Building2 size={16}/> Volver a la oficina</Link></div>
      <section className={styles.metrics} aria-label="Resumen"><div><Building2 size={17}/><span>Proyectos</span><strong>{data.counts.projects}</strong></div><div><Boxes size={17}/><span>Unidades</span><strong>{data.counts.units}</strong></div><div><FileText size={17}/><span>Listings Company</span><strong>{data.counts.listings}</strong></div><div><Activity size={17}/><span>En curso</span><strong>{data.counts.running}</strong></div><div><AlertTriangle size={17}/><span>Incidencias</span><strong>{data.counts.incidents}</strong></div><div><CheckCircle2 size={17}/><span>Arte aprobado</span><strong>{data.counts.approvedDesigns}</strong></div></section>
      <section className={styles.band}><div className={styles.bandHead}><h2>Presupuesto piloto</h2><span>Calculado + reservas, no facturación oficial</span></div><div className={styles.budgetLine}><strong>${data.budget.total.toFixed(3)}</strong><span>de ${data.budget.cap.toFixed(2)} · quedan ${data.budget.remaining.toFixed(3)}</span></div></section>
      <section className={styles.band}><div className={styles.bandHead}><h2>Producción Automaty</h2><Link href="/automation">Abrir cola <ExternalLink size={14}/></Link></div>{data.automation.available ? <><p>Modo: <strong>{data.automation.mode}</strong> · {Object.entries(data.automation.counts || {}).map(([status, count]) => `${status}: ${count}`).join(" · ") || "Sin trabajos"}</p><div className={styles.tableWrap}><table><thead><tr><th>Código</th><th>Origen</th><th>Producto</th><th>Estado</th><th>Incidencia</th></tr></thead><tbody>{data.automation.jobs?.map((job) => <tr key={job.id}><td>{job.productCode}</td><td>{job.companyListingId ? "Company" : "Manual"}</td><td>{job.productType}</td><td>{job.status}</td><td>{job.lastError || "—"}</td></tr>)}</tbody></table></div></> : <p>{data.automation.reason}</p>}</section>
      <section className={styles.band}><div className={styles.bandHead}><h2>Proyectos y colecciones</h2><span>{data.projects.length} recientes</span></div><div className={styles.tableWrap}><table><thead><tr><th>Proyecto</th><th>Unidades</th><th>Estado</th><th>Creado</th></tr></thead><tbody>{data.projects.map((project) => <tr key={project.id}><td>{project.title}</td><td>{project.units}</td><td>{project.status}</td><td>{new Date(project.created_at).toLocaleDateString("es-ES")}</td></tr>)}</tbody></table></div>{!data.projects.length && <p>Sin proyectos todavía.</p>}</section>
      <section className={styles.band}><div className={styles.bandHead}><h2>Listings Company</h2><span>{data.listings.length} recientes</span></div><div className={styles.tableWrap}><table><thead><tr><th>Código</th><th>Colección</th><th>Piezas</th><th>Estado</th></tr></thead><tbody>{data.listings.map((listing) => <tr key={listing.id}><td>{listing.product_code || "Sin asignar"}</td><td>{listing.project_title}</td><td>{listing.unit_count}</td><td>{listing.status}</td></tr>)}</tbody></table></div>{!data.listings.length && <p>Sin listings todavía.</p>}</section>
      <section className={styles.band}><div className={styles.bandHead}><h2>Integraciones</h2><span>Estado comprobable</span></div><div className={styles.integrations}><div><strong>Alura</strong><span>{data.providers.alura.enabled ? `Habilitada · ${data.providers.alura.credits.used}/${data.providers.alura.cap} créditos comprometidos` : data.providers.alura.configured ? "Clave disponible; investigación desactivada" : "Falta ALURA_API_KEY"}</span></div><div><strong>Kittl</strong><span>{data.providers.kittl.connected ? "Cuenta conectada por OAuth" : data.providers.kittl.configured ? "Pendiente de autorización" : "Falta AUTH_SECRET o COMPANY_PUBLIC_URL"}</span>{data.providers.kittl.configured && !data.providers.kittl.connected && <button type="button" onClick={connectKittl}>Conectar Kittl</button>}</div><div><strong>Automaty</strong><span>{data.automation.available ? "Cola accesible" : "Base de datos no accesible"}</span></div></div></section>
      <section className={styles.band}><div className={styles.bandHead}><h2>Equipo</h2><span>{data.roles.filter((role) => role.status === "active").length} operativos · {data.roles.filter((role) => role.status === "consultative").length} consultivos · {data.roles.length} puestos</span></div>{departments.map((department) => <div className={styles.department} key={department}><h3>{department}</h3><div>{data.roles.filter((role) => role.department === department).map((role) => <div className={styles.person} key={role.id}><AgentPortrait id={role.id} size={30}/><span>{role.name}</span><small data-status={role.status}>{role.status === "active" ? "Operativo" : role.status === "consultative" ? "Consultivo" : role.status === "blocked" ? "Bloqueado" : "Pendiente"}</small></div>)}</div></div>)}</section>
    </div>}
  </main>
}
