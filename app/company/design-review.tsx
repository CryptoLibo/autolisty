"use client"

import { useState } from "react"
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
  const selected = reviews.find((review) => review.concept_index === index)

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
      <label>Resultado en Kittl<input type="url" placeholder="https://www.kittl.com/..." value={url} onChange={(event) => setUrl(event.target.value)}/></label>
      <label>Evaluación<select value={verdict} onChange={(event) => setVerdict(event.target.value as "approved" | "revise")}><option value="approved">Aprobado</option><option value="revise">Revisar</option></select></label>
      <label>Observaciones<textarea maxLength={1500} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Qué funcionó o qué hay que corregir"/></label>
      {selected && <span>Última evaluación: {selected.verdict === "approved" ? "Aprobado" : "Revisar"}</span>}
      {error && <span className={styles.error}>{error}</span>}
      <button type="button" onClick={save} disabled={busy || verdict === "revise" && !notes.trim() || verdict === "approved" && !url.trim()}>Guardar evaluación</button>
    </div>
  </details>
}
