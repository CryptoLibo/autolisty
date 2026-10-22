"use client"

import { useEffect, useState } from "react"
import styles from "./workspace.module.css"

type Concept = { name: string; prompt: string }
type Review = { concept_index: number; verdict: string; notes: string; kittl_url: string | null }

export default function DesignReview({ taskId, concepts, reviews, onSaved }: { taskId: string; concepts: Concept[]; reviews: Review[]; onSaved: () => Promise<unknown> }) {
  const [index, setIndex] = useState(0)
  const [verdict, setVerdict] = useState<"approved" | "revise">("approved")
  const [notes, setNotes] = useState("")
  const [url, setUrl] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [models, setModels] = useState<Array<{ id: string; name: string; credits: number }>>([])
  const [modelId, setModelId] = useState("")
  const [generations, setGenerations] = useState<Array<{ id: string; concept_index: number; status: string; image_url: string | null; review_status: string | null; feedback: string | null }>>([])
  const selected = reviews.find((review) => review.concept_index === index)

  useEffect(() => {
    let active = true
    fetch("/api/company/kittl/models").then((response) => response.json()).then((body) => {
      if (active && body.models) { setModels(body.models); setModelId(body.models[0]?.id || "") }
    }).catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    async function poll() {
      const response = await fetch(`/api/company/tasks/${taskId}/kittl-generation`)
      const body = await response.json()
      if (active && body.generations) setGenerations(body.generations)
    }
    poll().catch(() => {})
    const timer = setInterval(() => { poll().catch(() => {}) }, 12000)
    return () => { active = false; clearInterval(timer) }
  }, [taskId])

  async function generate() {
    if (!modelId) return
    setBusy(true); setError("")
    try {
      const response = await fetch(`/api/company/tasks/${taskId}/kittl-generation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conceptIndex: index, modelId }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "No se pudo generar en Kittl.")
      setGenerations((rows) => [body.generation, ...rows])
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }

  async function save() {
    setBusy(true)
    setError("")
    try {
      const response = await fetch(`/api/company/tasks/${taskId}/design-review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conceptIndex: index, verdict, notes, kittlUrl: url }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "No se pudo guardar.")
      await onSaved()
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }

  return <details className={styles.report}>
    <summary>Evaluar resultados de Kittl ({reviews.length}/{concepts.length})</summary>
    <div className={styles.reviewForm}>
      <label>Concepto<select value={index} onChange={(event) => {
        const next = Number(event.target.value)
        const review = reviews.find((item) => item.concept_index === next)
        setIndex(next); setVerdict(review?.verdict === "revise" ? "revise" : "approved"); setNotes(review?.notes || ""); setUrl(review?.kittl_url || "")
      }}>{concepts.map((concept, conceptIndex) => <option key={conceptIndex} value={conceptIndex}>{concept.name}</option>)}</select></label>
      <p className={styles.reviewPrompt}>{concepts[index]?.prompt}</p>
      {models.length > 0 && <><label>Modelo de Kittl<select value={modelId} onChange={(event) => setModelId(event.target.value)}>{models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.credits} créditos</option>)}</select></label><button type="button" onClick={generate} disabled={busy || !modelId}>Generar imagen en Kittl</button></>}
      {generations.filter((item) => item.concept_index === index).map((item) => <div key={item.id}><span>Generación: {item.status}{item.review_status ? ` · ${item.review_status}` : ""}</span>{item.image_url && <img src={item.image_url} alt={`Resultado de Kittl para ${concepts[index]?.name || "diseño"}`} style={{ display: "block", maxWidth: "100%", maxHeight: 320, objectFit: "contain" }}/>} {item.feedback && <p>{item.feedback}</p>}</div>)}
      <label>Resultado en Kittl<input type="url" placeholder="https://www.kittl.com/..." value={url} onChange={(event) => setUrl(event.target.value)}/></label>
      <label>Evaluación<select value={verdict} onChange={(event) => setVerdict(event.target.value as "approved" | "revise")}><option value="approved">Aprobado</option><option value="revise">Revisar</option></select></label>
      <label>Observaciones<textarea maxLength={1500} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Qué funcionó o qué hay que corregir"/></label>
      {selected && <span>Última evaluación: {selected.verdict === "approved" ? "Aprobado" : "Revisar"}</span>}
      {error && <span className={styles.error}>{error}</span>}
      <button type="button" onClick={save} disabled={busy || verdict === "revise" && !notes.trim() || verdict === "approved" && !url.trim()}>Guardar evaluación</button>
    </div>
  </details>
}
