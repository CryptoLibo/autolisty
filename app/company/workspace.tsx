"use client"

import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, ArrowUp, Check, Pencil, Plus, RefreshCw, X } from "lucide-react"
import Link from "next/link"
import styles from "./workspace.module.css"

type Conversation = { id: string; first_message: string | null; updated_at: string }
type Message = { id: string; role: string; content: string }
type Task = { id: string; owner_message_id: string; status: string; stage: string; last_error: string | null; report?: { content: string; sources_json: string } | null; calls: Array<{ agent_id: string; model: string; input_tokens: number | null; output_tokens: number | null; web_calls: number | null; model_usd: number; tool_usd: number; status: string }> }
type Snapshot = { messages: Message[]; tasks: Task[]; budget: { total: number; model: number; tools: number; cap: number; remaining: number; localDailyTokens: { dayUtc: string; main: { used: number; limit: number }; economy: { used: number; limit: number } } } }

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || `Request failed: ${response.status}`)
  return body
}

export default function CompanyWorkspace() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [ceoName, setCeoName] = useState("James")
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState("")

  const refreshList = useCallback(async () => {
    const data = await jsonRequest("/api/company/conversations") as { conversations: Conversation[] }
    setConversations(data.conversations)
  }, [])

  const refresh = useCallback(async (id: string) => {
    const data = await jsonRequest(`/api/company/conversations/${id}`) as Snapshot
    setSnapshot(data)
    return data
  }, [])

  useEffect(() => {
    jsonRequest("/api/company/conversations").then((data: { conversations: Conversation[] }) => setConversations(data.conversations)).catch((e) => setError(String(e)))
    jsonRequest("/api/company/agents/ceo").then((data: { name: string }) => setCeoName(data.name)).catch((e) => setError(String(e)))
  }, [])

  async function saveName() {
    try {
      const data = await jsonRequest("/api/company/agents/ceo", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nameDraft }) }) as { name: string }
      setCeoName(data.name)
      setEditingName(false)
      setError("")
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  useEffect(() => {
    if (selected) jsonRequest(`/api/company/conversations/${selected}`).then((data: Snapshot) => setSnapshot(data)).catch((e) => setError(String(e)))
  }, [selected])

  const active = snapshot?.tasks.find((task) => ["PENDING", "RESEARCH_READY", "SYNTHESIS_READY"].includes(task.status))
  useEffect(() => {
    if (!selected || !active || busy) return
    const timer = setTimeout(async () => {
      setBusy(true)
      try {
        await jsonRequest(`/api/company/tasks/${active.id}/run`, { method: "POST" })
        await refresh(selected)
        await refreshList()
      } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
      finally { setBusy(false) }
    }, 250)
    return () => clearTimeout(timer)
  }, [selected, active, busy, refresh, refreshList])

  async function newConversation() {
    setError("")
    try {
      const data = await jsonRequest("/api/company/conversations", { method: "POST" }) as { id: string }
      await refreshList()
      setSelected(data.id)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  async function send() {
    if (!draft.trim() || busy) return
    setError("")
    setBusy(true)
    try {
      let id = selected
      if (!id) {
        const data = await jsonRequest("/api/company/conversations", { method: "POST" }) as { id: string }
        id = data.id
        setSelected(id)
      }
      await jsonRequest(`/api/company/conversations/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: draft.trim() }) })
      setDraft("")
      await refresh(id)
      await refreshList()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const latest = snapshot?.tasks.at(-1)
  return <main className={styles.shell}>
    <aside className={styles.sidebar}>
      <div className={styles.brand}><Link href="/" title="Volver a Autolisty" className={styles.icon}><ArrowLeft size={18}/></Link><strong>Autolisty Company</strong></div>
      <button className={styles.newButton} onClick={newConversation}><Plus size={16}/> Nueva conversación</button>
      <div className={styles.sideLabel}>Conversaciones</div>
      <div className={styles.conversationList}>{conversations.map((item) => <button key={item.id} className={`${styles.conversation} ${selected === item.id ? styles.selected : ""}`} onClick={() => setSelected(item.id)}>{item.first_message || "Nueva conversación"}</button>)}</div>
      <div className={styles.budget}>Reserva de prueba<br/><strong>${(snapshot?.budget.total || 0).toFixed(3)} / ${(snapshot?.budget.cap || 5).toFixed(2)}</strong><small>Tarifa calculada + reservas; no es el cargo oficial</small>{snapshot && <small>Tokens Company hoy (UTC): {snapshot.budget.localDailyTokens.main.used.toLocaleString("es-ES")} / 250.000 principal · {snapshot.budget.localDailyTokens.economy.used.toLocaleString("es-ES")} / 2.500.000 económico. No incluye otros usos de tu cuenta.</small>}</div>
    </aside>
    <section className={styles.main}>
      <header className={styles.header}><div>{editingName ? <div className={styles.nameEdit}><input aria-label="Nombre del CEO" maxLength={40} value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false) }}/><button className={styles.icon} title="Guardar nombre" onClick={saveName}><Check size={16}/></button><button className={styles.icon} title="Cancelar" onClick={() => setEditingName(false)}><X size={16}/></button></div> : <div className={styles.nameEdit}><strong>{ceoName}</strong><button className={styles.icon} title="Cambiar nombre" onClick={() => { setNameDraft(ceoName); setEditingName(true) }}><Pencil size={15}/></button></div>}<span>Dirección general</span></div><button className={styles.icon} title="Actualizar" onClick={() => selected && refresh(selected).catch((e) => setError(String(e)))}><RefreshCw size={18}/></button></header>
      <div className={styles.history}>
        {!snapshot?.messages.length && <div className={styles.empty}>Habla con el CEO sobre una idea, pide una explicación o encarga una investigación.</div>}
        {snapshot?.tasks.map((task, taskIndex) => {
          const messages = snapshot.messages
          const userIndex = messages.findIndex((message) => message.id === task.owner_message_id)
          if (userIndex < 0) return null
          const nextUserIndex = messages.findIndex((message, index) => index > userIndex && message.role === "user")
          const answer = messages.slice(userIndex + 1, nextUserIndex < 0 ? undefined : nextUserIndex).find((message) => message.role === "assistant")
          const completedCalls = task.calls.filter((call) => call.status === "COMPLETED")
          return <div key={task.id} className={styles.turn}>
            <article className={`${styles.message} ${styles.user}`}><div className={styles.speaker}>Tú</div><div className={styles.messageText}>{messages[userIndex].content}</div></article>
            {task.report && <details className={styles.report}>
              <summary>Informe del investigador y fuentes</summary>
              <div className={styles.messageText}>{task.report.content}</div>
              <ul>{(JSON.parse(task.report.sources_json) as Array<{ title: string; url: string }>).map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul>
            </details>}
            {answer && <article className={`${styles.message} ${styles.assistant}`}><div className={styles.speaker}>{ceoName}</div><div className={styles.messageText}>{answer.content}</div></article>}
            {task.status !== "COMPLETED" && <div className={styles.status}>{task.status === "NEEDS_REVIEW" ? `Necesita revisión: ${task.last_error}` : busy && taskIndex === snapshot.tasks.length - 1 ? `Trabajando: ${task.stage}` : `Pendiente: ${task.stage}`}</div>}
            {completedCalls.length > 0 && <details className={styles.usage}>
              <summary>Consumo de esta pregunta: {completedCalls.length} {completedCalls.length === 1 ? "llamada" : "llamadas"}</summary>
              <div className={styles.callList}>{completedCalls.map((call, callIndex) => <div className={styles.callRow} key={callIndex}>
                <span>{call.agent_id === "market_researcher" ? "Investigador" : "CEO"} · {call.model}</span>
                <span>{(call.input_tokens || 0).toLocaleString("es-ES")} entrada · {(call.output_tokens || 0).toLocaleString("es-ES")} salida · {call.web_calls || 0} búsquedas</span>
                <span>${(call.model_usd + call.tool_usd).toFixed(4)} estimados</span>
              </div>)}</div>
            </details>}
          </div>
        })}
      </div>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.composer}><textarea aria-label="Mensaje al CEO" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }} placeholder="Escribe al CEO..." rows={3} disabled={busy || !!latest && !["COMPLETED", "NEEDS_REVIEW"].includes(latest.status)}/><button title="Enviar" onClick={send} disabled={!draft.trim() || busy}><ArrowUp size={20}/></button></div>
    </section>
  </main>
}
