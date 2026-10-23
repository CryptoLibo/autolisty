"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowUp, Building2, Check, ClipboardList, Link2, MessageSquare, Minus, Palette, Plus, RefreshCw, Search, Shapes, Users, X } from "lucide-react"
import Link from "next/link"
import DesignReview from "../design-review"
import AgentPortrait from "./agent-portrait"
import CompanyWorld from "./company-world"
import VoiceControls from "./voice-controls"
import type { OfficeFocus, WorkState } from "./habblaud-world"
import styles from "./workspace.module.css"

type Agent = { id: string; name: string; role: string; department: string; status: "active" | "consultative" | "planned" | "blocked"; procedure?: { input: string; output: string; policy: string; escalate: string } }
type Conversation = { id: string; first_message: string | null; updated_at: string }
type Message = { id: string; role: string; content: string }
type Task = { id: string; owner_message_id: string; status: string; stage: string; specialist_agent_id?: string | null; last_error: string | null; report?: { content: string; sources_json: string } | null; artifacts: Array<{ kind: string; content: string; data_json: string | null }>; designReviews: Array<{ concept_index: number; verdict: string; notes: string; kittl_url: string | null }>; calls: Array<{ agent_id: string; input_tokens: number | null; output_tokens: number | null; model_usd: number; tool_usd: number }> }
type Snapshot = { messages: Message[]; tasks: Task[]; telegramLinked: boolean; budget: { total: number; cap: number; localDailyTokens: { main: { used: number }; economy: { used: number } } } }
type OfficeData = { agents: Agent[]; linkedConversationId: string | null; conversations: Conversation[] }

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" })
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null
  if (!response.ok) throw new Error(body?.error || `Error ${response.status}`)
  if (!body) throw new Error("El servidor devolvió una respuesta vacía.")
  return body
}

function timeLabel(date: string) {
  return new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" }).format(new Date(date))
}

function taskLabel(task: Task) {
  if (task.status === "NEEDS_REVIEW") return "Necesita atención"
  if (task.status === "COMPLETED") return "Completada"
  if (task.status === "CANCELLED") return "Cancelada"
  if (task.stage === "RESEARCH") return "Investigando"
  if (task.stage === "PRODUCT_PLAN") return "Planificando producto"
  if (task.stage === "VISUAL_DESIGN") return "Diseñando conceptos"
  if (task.stage === "SPECIALIST") return "Consultando especialista"
  if (task.stage === "CEO_SYNTHESIZE") return "James analiza"
  return "James responde"
}

export default function OfficeWorkspace() {
  const [office, setOffice] = useState<OfficeData | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [focus, setFocus] = useState<OfficeFocus | null>(null)
  const [departmentFocus, setDepartmentFocus] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [showConversations, setShowConversations] = useState(false)
  const processing = useRef<string | null>(null)
  const messagesEnd = useRef<HTMLDivElement>(null)

  const refreshOffice = useCallback(async () => {
    const data = await requestJson<OfficeData>("/api/company/office")
    setOffice(data)
    setConversationId((current) => current || data.linkedConversationId || data.conversations[0]?.id || null)
  }, [])

  const refreshConversation = useCallback(async (id: string) => {
    const data = await requestJson<Snapshot>(`/api/company/conversations/${id}`)
    setSnapshot(data)
    return data
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => refreshOffice().catch((cause) => setError(String(cause))), 0)
    return () => window.clearTimeout(timer)
  }, [refreshOffice])

  useEffect(() => {
    if (!conversationId) return
    const initial = window.setTimeout(() => refreshConversation(conversationId).catch((cause) => setError(String(cause))), 0)
    const timer = window.setInterval(() => refreshConversation(conversationId).catch(() => {}), 4000)
    return () => { window.clearTimeout(initial); window.clearInterval(timer) }
  }, [conversationId, refreshConversation])

  const active = snapshot?.tasks.find((task) => ["PENDING", "RESEARCH_READY", "DESIGN_READY", "SPECIALIST_READY", "SYNTHESIS_READY"].includes(task.status))
  useEffect(() => {
    if (!active || !conversationId || processing.current === active.id) return
    processing.current = active.id
    requestJson(`/api/company/tasks/${active.id}/run`, { method: "POST" })
      .then(() => refreshConversation(conversationId))
      .catch((cause) => setError(String(cause)))
      .finally(() => { processing.current = null })
  }, [active, conversationId, refreshConversation])

  useEffect(() => {
    if (focus === "ceo") messagesEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [snapshot?.messages.length, focus])

  async function createConversation() {
    setError("")
    try {
      const result = await requestJson<{ id: string }>("/api/company/conversations", { method: "POST" })
      setConversationId(result.id)
      setSnapshot(null)
      setShowConversations(false)
      setFocus("ceo")
      await refreshOffice()
    } catch (cause) { setError(String(cause)) }
  }

  async function send() {
    if (!draft.trim() || busy) return
    setBusy(true)
    setError("")
    try {
      let id = conversationId
      if (!id) {
        const created = await requestJson<{ id: string }>("/api/company/conversations", { method: "POST" })
        id = created.id
        setConversationId(id)
      }
      await requestJson(`/api/company/conversations/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: draft.trim() }) })
      setDraft("")
      await refreshConversation(id)
      await refreshOffice()
    } catch (cause) { setError(String(cause)) }
    finally { setBusy(false) }
  }

  async function linkTelegram() {
    if (!conversationId) return
    setError("")
    try {
      await requestJson("/api/company/telegram/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId }) })
      await refreshConversation(conversationId)
      await refreshOffice()
    } catch (cause) { setError(String(cause)) }
  }


  const ceo = office?.agents.find((agent) => agent.id === "ceo")
  const researcher = office?.agents.find((agent) => agent.id === "market_researcher")
  const planner = office?.agents.find((agent) => agent.id === "product_planner")
  const designer = office?.agents.find((agent) => agent.id === "visual_designer")
  const latestTask = snapshot?.tasks.at(-1)
  const ceoState: WorkState = latestTask?.status === "NEEDS_REVIEW" ? "attention" : latestTask && !["COMPLETED", "CANCELLED"].includes(latestTask.status) && latestTask.stage !== "RESEARCH" ? "working" : "idle"
  const researcherState: WorkState = latestTask && !["COMPLETED", "NEEDS_REVIEW", "CANCELLED"].includes(latestTask.status) && latestTask.stage === "RESEARCH" ? "working" : "idle"
  const plannerState: WorkState = latestTask && !["COMPLETED", "NEEDS_REVIEW", "CANCELLED"].includes(latestTask.status) && latestTask.stage === "PRODUCT_PLAN" ? "working" : "idle"
  const designerState: WorkState = latestTask && !["COMPLETED", "NEEDS_REVIEW", "CANCELLED"].includes(latestTask.status) && latestTask.stage === "VISUAL_DESIGN" ? "working" : "idle"
  const latestReport = snapshot?.tasks.slice().reverse().find((task) => task.report)?.report
  const latestDesignTask = snapshot?.tasks.slice().reverse().find((task) => task.artifacts?.some((artifact) => artifact.kind === "design_concepts"))
  const designData = latestDesignTask?.artifacts.find((artifact) => artifact.kind === "design_concepts")?.data_json
  const designConcepts = designData ? (JSON.parse(designData) as { concepts: Array<{ name: string; prompt: string }> }).concepts : []
  const visibleAgents: Array<{ agent: Agent | undefined; state: WorkState }> = [
    { agent: ceo, state: ceoState }, { agent: researcher, state: researcherState },
    { agent: planner, state: plannerState }, { agent: designer, state: designerState },
  ]
  const openTasks = snapshot?.tasks.filter((task) => !["COMPLETED", "NEEDS_REVIEW", "CANCELLED"].includes(task.status)) || []
  const attentionTasks = snapshot?.tasks.filter((task) => task.status === "NEEDS_REVIEW") || []
  const currentTask = openTasks.at(-1)
  const taskSteps = ["CEO_DECIDE", "RESEARCH", "PRODUCT_PLAN", "VISUAL_DESIGN", "SPECIALIST", "CEO_SYNTHESIZE"]
  const progress = currentTask ? Math.max(12, Math.round(((taskSteps.indexOf(currentTask.stage) + 1) / taskSteps.length) * 100)) : 0

  return <div className={styles.shell}>
    <header className={styles.topbar}>
      <div className={styles.brand}><Link href="/" aria-label="Volver a Autolisty" title="Volver a Autolisty"><ArrowLeft size={17}/></Link><div className={styles.brandMark}>AL</div><div><strong>Autolisty Company</strong><span>OFICINA · DIRECCIÓN</span></div></div>
      <div className={styles.topMeta}><span className={styles.headerCount}><strong>{office?.agents.filter((agent) => agent.status === "active").length || 0}</strong> operativos / {office?.agents.length || 0} puestos</span><span className={styles.headerCount}><strong>{openTasks.length}</strong> en curso</span><span className={styles.liveDot}/><span>{office ? "Conectado" : "Conectando"}</span><Link href="/company/operations" title="Operaciones" aria-label="Operaciones"><Building2 size={17}/></Link><button title="Abrir chat con James" aria-label="Abrir chat con James" onClick={() => setFocus("ceo")}><MessageSquare size={17}/></button><button title="Actualizar" aria-label="Actualizar" onClick={() => { refreshOffice(); if (conversationId) refreshConversation(conversationId) }}><RefreshCw size={17}/></button></div>
    </header>
    <div className={styles.body}>
      <nav className={styles.rail} aria-label="Áreas de la oficina">
        <div className={styles.railHeading}>Escritorio</div>
        <button className={focus === "ceo" ? styles.active : ""} onClick={() => setFocus("ceo")}><AgentPortrait id="ceo" size={32}/><span>James</span><small>{ceoState === "attention" ? "Necesita atención" : ceoState === "working" ? "Trabajando" : "Disponible"}</small></button>
        <button className={focus === "research" ? styles.active : ""} onClick={() => setFocus("research")}><Search size={18}/><span>{researcher?.name || "Investigador"}</span><small>{researcherState === "working" ? "Investigando" : "Disponible"}</small></button>
        <button className={focus === "product" ? styles.active : ""} onClick={() => setFocus("product")}><Shapes size={18}/><span>{planner?.name || "Producto"}</span><small>{plannerState === "working" ? "Planificando" : "Disponible"}</small></button>
        <button className={focus === "creative" ? styles.active : ""} onClick={() => setFocus("creative")}><Palette size={18}/><span>{designer?.name || "Diseño"}</span><small>{designerState === "working" ? "Diseñando" : "Disponible"}</small></button>
        <div className={styles.railHeading}>CENTRO DE CONTROL</div>
        <button className={focus === "board" ? styles.active : ""} onClick={() => setFocus("board")}><ClipboardList size={18}/><span>Actividad</span></button>
        <button className={focus === "lounge" ? styles.active : ""} onClick={() => { setDepartmentFocus(null); setFocus("lounge") }}><Users size={18}/><span>Equipo</span></button>
        <div className={styles.railBudget}><small>PRESUPUESTO PILOTO</small><strong>${(snapshot?.budget.total || 0).toFixed(3)} <span>/ ${(snapshot?.budget.cap || 5).toFixed(2)}</span></strong><div className={styles.budgetTrack}><span style={{ width: `${Math.min(100, ((snapshot?.budget.total || 0) / (snapshot?.budget.cap || 5)) * 100)}%` }}/></div><small>Coste calculado y reservas</small></div>
      </nav>
      <main className={styles.stage}>
        {error && <div className={styles.stageError} role="alert">{error}</div>}
        <div className={styles.stageTop}><div><span className={styles.eyebrow}>SEDE CENTRAL / VISTA EN DIRECTO</span><h1>La oficina</h1></div><div className={styles.zoomTools}><button aria-label="Alejar" title="Alejar" onClick={() => setZoom((value) => Math.max(.8, +(value - .2).toFixed(1)))} disabled={zoom <= .8}><Minus size={16}/></button><span>{Math.round(zoom * 100)}%</span><button aria-label="Acercar" title="Acercar" onClick={() => setZoom((value) => Math.min(1.8, +(value + .2).toFixed(1)))} disabled={zoom >= 1.8}><Plus size={16}/></button></div></div>
        <button className={styles.missionBar} onClick={() => setFocus("board")} aria-label="Abrir actividad y progreso"><span className={styles.missionGlyph}><ClipboardList size={18}/></span><span className={styles.missionText}><strong>{currentTask ? taskLabel(currentTask) : attentionTasks.length ? `${attentionTasks.length} tarea${attentionTasks.length > 1 ? "s" : ""} necesita${attentionTasks.length > 1 ? "n" : ""} atención` : "Sin tareas en curso"}</strong><small>{currentTask ? `Etapa ${currentTask.stage.replaceAll("_", " ")} · ${openTasks.length} en curso` : attentionTasks.length ? "Abre la actividad para revisar el problema" : "La oficina está lista para un nuevo encargo"}</small></span><span className={styles.missionProgress} aria-hidden="true"><span style={{ width: `${progress}%` }}/></span><span className={styles.missionAction}>Ver actividad</span></button>
        <div className={styles.worldViewport}><div className={styles.sceneWrap} style={{ width: `${zoom * 100}%`, minWidth: `${zoom * 1000}px` }}><CompanyWorld ceoName={ceo?.name || "James"} researcherName={researcher?.name || "Investigación"} plannerName={planner?.name || "Producto"} designerName={designer?.name || "Diseño"} ceoState={ceoState} researcherState={researcherState} plannerState={plannerState} designerState={designerState} workingSpecialistId={latestTask?.stage === "SPECIALIST" && !["COMPLETED", "NEEDS_REVIEW"].includes(latestTask.status) ? latestTask.specialist_agent_id : null} roster={office?.agents || []} onFocus={setFocus} onDepartment={(department) => { setDepartmentFocus(department); setFocus("lounge") }}/></div></div>
        <div className={styles.sceneFooter}>{visibleAgents.map(({ agent, state }) => agent && <button key={agent.id} onClick={() => setFocus(agent.id === "ceo" ? "ceo" : agent.id === "market_researcher" ? "research" : agent.id === "product_planner" ? "product" : "creative")}><AgentPortrait id={agent.id} size={28}/><span><strong>{agent.name}</strong><small>{state === "working" ? "Trabajando" : state === "attention" ? "Requiere atención" : "Disponible"}</small></span><span className={styles.smallDot} data-state={state}/></button>)}</div>
        <button className={styles.feed} onClick={() => setFocus("board")}><strong>BITÁCORA</strong><div>{snapshot?.tasks.slice().reverse().slice(0, 3).map((task) => <span key={task.id}><span className={styles.smallDot} data-state={task.status === "NEEDS_REVIEW" ? "attention" : task.status === "COMPLETED" ? "idle" : "working"}/>{taskLabel(task)}</span>)}{!snapshot?.tasks.length && <span>Sin tareas recientes</span>}</div><span className={styles.feedArrow}>Abrir <ArrowUp size={13}/></span></button>
      </main>
      {focus && <aside className={styles.detail}>
        <div className={styles.detailTop}>{["ceo", "research", "product", "creative"].includes(focus) && <AgentPortrait id={focus === "ceo" ? "ceo" : focus === "research" ? "market_researcher" : focus === "product" ? "product_planner" : "visual_designer"} size={42}/>}<div><span className={styles.eyebrow}>{focus === "ceo" ? "DIRECCIÓN GENERAL" : focus === "research" ? "INVESTIGACIÓN" : focus === "product" ? "PRODUCTO" : focus === "creative" ? "CREATIVO" : focus === "board" ? "PIZARRA" : "EQUIPO"}</span><h2>{focus === "ceo" ? ceo?.name || "James" : focus === "research" ? researcher?.name || "Investigador" : focus === "product" ? planner?.name || "Producto" : focus === "creative" ? designer?.name || "Diseño" : focus === "board" ? "Actividad" : departmentFocus || "Equipo"}</h2></div><button title="Cerrar panel" aria-label="Cerrar panel" onClick={() => setFocus(null)}><X size={17}/></button></div>
        {focus === "ceo" && <>
          <div className={styles.conversationBar}><button onClick={() => setShowConversations((value) => !value)} title="Conversaciones"><MessageSquare size={16}/><span>{snapshot?.telegramLinked ? "Conversación compartida" : "Conversación"}</span></button><button onClick={createConversation} title="Nueva conversación" aria-label="Nueva conversación"><Plus size={16}/></button>{conversationId && <VoiceControls key={conversationId} conversationId={conversationId} refresh={refreshConversation}/>}{conversationId && <button onClick={linkTelegram} disabled={snapshot?.telegramLinked} title={snapshot?.telegramLinked ? "Telegram vinculado" : "Vincular Telegram"} aria-label={snapshot?.telegramLinked ? "Telegram vinculado" : "Vincular Telegram"}>{snapshot?.telegramLinked ? <Check size={16}/> : <Link2 size={16}/>}</button>}</div>
          {showConversations && <div className={styles.conversationMenu}>{office?.conversations.map((item) => <button key={item.id} className={item.id === conversationId ? styles.selected : ""} onClick={() => { setConversationId(item.id); setSnapshot(null); setShowConversations(false) }}><span>{item.first_message || "Nueva conversación"}</span><small>{timeLabel(item.updated_at)}</small></button>)}</div>}
          <div className={styles.messages}>{snapshot?.messages.map((message) => <div key={message.id} className={message.role === "user" ? styles.userMessage : styles.assistantMessage}><strong>{message.role === "user" ? "Tú" : ceo?.name || "James"}</strong><p>{message.content}</p></div>)}{!snapshot?.messages.length && <div className={styles.empty}>No hay mensajes en esta conversación.</div>}{latestTask && !["COMPLETED", "CANCELLED"].includes(latestTask.status) && <div className={styles.taskStatus}>{taskLabel(latestTask)}{latestTask.last_error ? `: ${latestTask.last_error}` : ""}</div>}<div ref={messagesEnd}/></div>
          <div className={styles.composer}><textarea aria-label="Mensaje a James" placeholder="Escribe a James..." value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send() } }} disabled={busy || !!latestTask && !["COMPLETED", "NEEDS_REVIEW", "CANCELLED"].includes(latestTask.status)} rows={3}/><button title="Enviar" aria-label="Enviar" onClick={send} disabled={!draft.trim() || busy}><ArrowUp size={18}/></button></div>
        </>}
        {focus === "research" && <div className={styles.infoScroll}><div className={styles.infoRow}><span>Estado</span><strong>{researcherState === "working" ? "Investigando" : "Disponible"}</strong></div><div className={styles.infoRow}><span>Especialidad</span><strong>Mercado y fuentes</strong></div><h3>Último informe</h3>{latestReport ? <><p className={styles.reportText}>{latestReport.content}</p><h3>Fuentes</h3>{(JSON.parse(latestReport.sources_json) as Array<{ title: string; url: string }>).map((source) => <a className={styles.source} href={source.url} key={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</> : <p className={styles.empty}>Sin informes en esta conversación.</p>}</div>}
        {(focus === "product" || focus === "creative") && <div className={styles.infoScroll}>
          <div className={styles.infoRow}><span>Estado</span><strong>{(focus === "product" ? plannerState : designerState) === "working" ? "Trabajando" : "Disponible"}</strong></div>
          <div className={styles.infoRow}><span>Especialidad</span><strong>{focus === "product" ? "Planificación de productos" : "Conceptos y prompts visuales"}</strong></div>
          {focus === "creative" && latestDesignTask && <>
            <h3>Últimos conceptos</h3>
            {designConcepts.map((concept, index) => <div className={styles.concept} key={index}><strong>{concept.name}</strong><p>{concept.prompt}</p></div>)}
            {latestDesignTask.status === "COMPLETED" && designConcepts.length > 0 && <div className={styles.review}><DesignReview taskId={latestDesignTask.id} concepts={designConcepts} reviews={latestDesignTask.designReviews || []} onSaved={() => conversationId ? refreshConversation(conversationId) : Promise.resolve()}/></div>}
          </>}
          <h3>Actividad reciente</h3>
          {snapshot?.tasks.slice().reverse().filter((task) => task.calls.some((call) => call.agent_id === (focus === "product" ? "product_planner" : "visual_designer"))).slice(0, 5).map((task) => <div className={styles.taskItem} key={task.id}><span className={styles.smallDot} data-state={task.status === "NEEDS_REVIEW" ? "attention" : task.status === "COMPLETED" ? "idle" : "working"}/><span>{taskLabel(task)}</span></div>)}
          {!snapshot?.tasks.some((task) => task.calls.some((call) => call.agent_id === (focus === "product" ? "product_planner" : "visual_designer"))) && <p className={styles.empty}>Sin actividad en esta conversación.</p>}
        </div>}
        {focus === "board" && <div className={styles.infoScroll}>
          <div className={styles.infoRow}><span>Tareas</span><strong>{snapshot?.tasks.length || 0}</strong></div>
          <div className={styles.infoRow}><span>Reserva piloto</span><strong>${(snapshot?.budget.total || 0).toFixed(3)} / ${(snapshot?.budget.cap || 5).toFixed(2)}</strong></div>
          <h3>Actividad reciente</h3>
          {snapshot?.tasks.slice().reverse().slice(0, 8).map((task) => <div className={styles.activity} key={task.id}>
            <div className={styles.taskItem}><span className={styles.smallDot} data-state={task.status === "NEEDS_REVIEW" ? "attention" : task.status === "COMPLETED" ? "idle" : "working"}/><span>{taskLabel(task)}</span></div>
            {task.calls.map((call, index) => <div className={styles.callUsage} key={`${task.id}-${index}`}><span>{office?.agents.find((agent) => agent.id === call.agent_id)?.name || call.agent_id}</span><span>{(call.input_tokens || 0) + (call.output_tokens || 0)} tokens · ${(call.model_usd + call.tool_usd).toFixed(4)} calculados</span></div>)}
          </div>)}
          {!snapshot?.tasks.length && <p className={styles.empty}>No hay tareas recientes.</p>}
        </div>}
        {focus === "lounge" && <div className={styles.infoScroll}>{[...new Set(office?.agents.map((agent) => agent.department) || [])].filter((department) => !departmentFocus || department === departmentFocus).map((department) => <section key={department}><h3>{department}</h3>{office?.agents.filter((agent) => agent.department === department).map((agent) => <div className={styles.memberRow} key={agent.id}><AgentPortrait id={agent.id} size={38}/><span><strong>{agent.name}</strong><small>{agent.status === "active" ? "Operativo" : agent.status === "consultative" ? "Consultivo" : agent.status === "blocked" ? "Bloqueado" : "Previsto"} · {agent.role}</small>{agent.procedure && <><small>Recibe: {agent.procedure.input}</small><small>Entrega: {agent.procedure.output}</small><small>Límite: {agent.procedure.policy}</small><small>Escala: {agent.procedure.escalate}</small></>}</span></div>)}</section>)}</div>}
      </aside>}
    </div>
  </div>
}
