"use client"

import { useEffect, useState } from "react"
import { Check, RefreshCw, Sparkles } from "lucide-react"
import { PRODUCT_OPTIONS } from "@/lib/products"
import type { ResearchInvestigation } from "@/lib/research/contracts"
import type { PromptCandidate } from "@/lib/research/promptDiversity"

type Result = { versionId: string; runId: string; version: number; status: string; prompts: PromptCandidate[];
  evaluation: { passed: boolean; issues: Array<{ index: number; reason: string }> } | null;
  attempts: unknown[]; usage: { totalTokens?: number } | null; estimatedCostUsd: number | null;
  selected: number[]; links: Array<{ prompt_index: number; concept_id: string }> }
type Run = { id: string; run_id: string; version: number; status: string; created_at: string; mode: string; input_json: string }

export function CreativePromptWorkspace({ marketSource }: { marketSource?: { investigationId: string; opportunityId: string; brief: string } | null }) {
  const [mode, setMode] = useState<"variations" | "independent">("variations")
  const [brief, setBrief] = useState(marketSource?.brief || "")
  const [niche, setNiche] = useState("")
  const [productType, setProductType] = useState("")
  const [investigationId, setInvestigationId] = useState(marketSource?.investigationId || "")
  const [opportunityId, setOpportunityId] = useState(marketSource?.opportunityId || "")
  const [conceptId, setConceptId] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [investigations, setInvestigations] = useState<ResearchInvestigation[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [versions, setVersions] = useState<Result[]>([])
  const [result, setResult] = useState<Result | null>(null)
  const [correction, setCorrection] = useState("")
  const [correctionScope, setCorrectionScope] = useState<"general" | "niche" | "product" | "design">("general")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  useEffect(() => {
    fetch("/api/research/investigations", { cache: "no-store" }).then((response) => response.json())
      .then((data) => setInvestigations(data.investigations || [])).catch(() => {})
    void refreshHistory()
  }, [])

  async function refreshHistory() {
    const response = await fetch("/api/research/creative", { cache: "no-store" })
    if (response.ok) setRuns((await response.json()).runs || [])
  }

  async function openVersion(versionId: string) {
    setError("")
    try {
      const response = await fetch(`/api/research/creative?versionId=${encodeURIComponent(versionId)}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok || !data.result) throw new Error(data.error || "Version unavailable.")
      setResult(data.result)
      const history = await fetch(`/api/research/creative?runId=${encodeURIComponent(data.result.runId)}`, { cache: "no-store" })
      if (history.ok) setVersions((await history.json()).versions || [])
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Version unavailable.") }
  }

  async function generate(regenerate = false) {
    setBusy(true); setError(""); setNotice("")
    try {
      const form = new FormData()
      for (const [key, value] of Object.entries({ brief, niche, productType, investigationId, opportunityId, conceptId: mode === "variations" ? conceptId : "", mode, regenerate: String(regenerate) })) form.set(key, value)
      files.forEach((file) => form.append("files", file))
      const response = await fetch("/api/research/creative", { method: "POST", body: form })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Prompt generation failed.")
      setResult(data.result)
      setNotice(data.result.cached ? "Previous result reused; no new model call." : "Four prompts saved.")
      await refreshHistory()
      await openVersion(data.result.versionId)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Prompt generation failed.") }
    finally { setBusy(false) }
  }

  async function select(index: number) {
    if (!result) return
    const response = await fetch("/api/research/creative/select", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ versionId: result.versionId, index }) })
    const data = await response.json()
    if (response.ok) setResult(data.result)
    else setError(data.error || "Selection failed.")
  }

  async function saveCorrection() {
    const scopeKey = correctionScope === "niche" ? niche : correctionScope === "product" ? productType :
      correctionScope === "design" ? `concept:${result?.links?.find((link) => link.prompt_index === result.selected.at(-1))?.concept_id || ""}` : ""
    if (correctionScope !== "general" && !scopeKey) { setError("Choose a niche, product or saved concept for this correction."); return }
    const response = await fetch("/api/research/corrections", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: correction, scope: correctionScope, scopeKey, activate: true }) })
    const data = await response.json()
    if (!response.ok) { setError(data.error || "Unable to save correction."); return }
    setCorrection("")
    setNotice(data.needsConfirmation ? "Correction saved for conflict review; not yet active." : "Correction active for the next applicable generation.")
  }

  return <div className="space-y-6 text-neutral-200">
    <div className="border-b border-neutral-800 pb-4"><h2 className="text-xl font-semibold">Create prompts</h2></div>
    <div className="grid gap-4 lg:grid-cols-2">
      <label className="space-y-1 text-sm">Creative brief<textarea value={brief} onChange={(event) => setBrief(event.target.value)} maxLength={2000}
        className="min-h-28 w-full border border-neutral-700 bg-neutral-950 p-3" placeholder="Describe the creative direction" /></label>
      <div className="space-y-4">
        <label className="block space-y-1 text-sm">Saved investigation (draft, not verified market data)
          <select value={investigationId} onChange={(event) => { setInvestigationId(event.target.value); setOpportunityId("") }} className="w-full border border-neutral-700 bg-neutral-950 p-2">
            <option value="">None</option>{investigations.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label className="block space-y-1 text-sm">Visual references (up to 3, 8 MB each)
          <input type="file" accept="image/*" multiple onChange={(event) => setFiles([...event.target.files || []])} className="block w-full text-sm" /></label>
      </div>
      <label className="space-y-1 text-sm">Niche<input value={niche} onChange={(event) => setNiche(event.target.value)}
        className="w-full border border-neutral-700 bg-neutral-950 p-2" placeholder="Optional" /></label>
      <label className="space-y-1 text-sm">Product context (optional)
        <select value={productType} onChange={(event) => setProductType(event.target.value)} className="w-full border border-neutral-700 bg-neutral-950 p-2">
          <option value="">No product selected</option>{PRODUCT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <div role="group" aria-label="Generation mode" className="inline-flex border border-neutral-700">
        <button type="button" aria-pressed={mode === "variations"} onClick={() => setMode("variations")}
          className={`px-3 py-2 text-sm ${mode === "variations" ? "bg-[#eeba2b] text-black" : "bg-neutral-900"}`}>Commercial variations</button>
        <button type="button" aria-pressed={mode === "independent"} onClick={() => setMode("independent")}
          className={`px-3 py-2 text-sm ${mode === "independent" ? "bg-[#eeba2b] text-black" : "bg-neutral-900"}`}>Independent concepts</button>
      </div>
      <button type="button" disabled={busy || (!brief.trim() && !investigationId && !files.length)} onClick={() => void generate()}
        className="inline-flex items-center gap-2 bg-[#eeba2b] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"><Sparkles size={16} />{busy ? "Generating..." : "Generate four prompts"}</button>
      {result && <button type="button" disabled={busy} onClick={() => void generate(true)} className="inline-flex items-center gap-2 border border-neutral-700 px-3 py-2 text-sm"><RefreshCw size={15} />Regenerate</button>}
    </div>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}{notice && <p role="status" className="text-sm text-emerald-400">{notice}</p>}
    {result && <section className="space-y-3"><div className="flex flex-wrap items-center gap-4 text-sm text-neutral-400"><strong className="text-neutral-100">Version {result.version}</strong>
      <span>{result.evaluation?.passed ? "Diversity checks passed" : "Review diversity warnings"}</span>
      <span>{result.usage?.totalTokens || 0} reported tokens</span></div>
      {result.evaluation?.issues.map((issue, index) => <p key={index} className="text-sm text-amber-400">Prompt {issue.index + 1}: {issue.reason}</p>)}
      <div className="grid gap-3 lg:grid-cols-2">{result.prompts.map((item, index) => <article key={index} className="space-y-2 border border-neutral-700 bg-neutral-950 p-4">
        <div className="flex items-start justify-between gap-3"><h3 className="font-semibold">{index + 1}. {item.title}</h3>
          <button type="button" onClick={() => void select(index)} title="Keep this proposal" className="border border-neutral-700 p-2 text-[#eeba2b]"><Check size={16} /></button></div>
        <p className="text-sm text-neutral-300">{item.prompt}</p>
        <p className="text-xs text-neutral-500">Subject: {item.subject} · Composition: {item.composition} · Angle: {item.commercialAngle}</p>
        {result.selected.includes(index) && <p className="text-xs text-emerald-400">Saved</p>}
        {mode === "variations" && result.links.some((link) => link.prompt_index === index) && <button type="button" onClick={() => {
          setConceptId(result.links.find((link) => link.prompt_index === index)!.concept_id)
          setNotice("Saved concept selected for the next generation.")
        }} className="text-xs text-[#eeba2b] hover:underline">Reuse concept</button>}
      </article>)}</div></section>}
    <section className="space-y-3 border-t border-neutral-800 pt-4"><h3 className="font-semibold">Corrections</h3>
      <textarea value={correction} onChange={(event) => setCorrection(event.target.value)} maxLength={1000} className="min-h-20 w-full border border-neutral-700 bg-neutral-950 p-3" placeholder="Describe what should change in future prompts" />
      <div className="flex flex-wrap gap-3"><select value={correctionScope} onChange={(event) => setCorrectionScope(event.target.value as typeof correctionScope)} className="border border-neutral-700 bg-neutral-950 p-2 text-sm">
        <option value="general">General</option><option value="niche">This niche</option><option value="product">This product</option><option value="design">This concept</option></select>
        <button type="button" disabled={!correction.trim()} onClick={() => void saveCorrection()} className="border border-[#eeba2b] px-4 py-2 text-sm text-[#eeba2b] disabled:opacity-50">Save correction</button></div></section>
    <section className="space-y-2 border-t border-neutral-800 pt-4"><h3 className="font-semibold">History</h3>
      {versions.length > 1 && <div className="flex flex-wrap gap-2">{versions.map((version) => <button key={version.versionId} type="button" onClick={() => void openVersion(version.versionId)}
        className="border border-neutral-700 px-3 py-1 text-sm">Version {version.version}</button>)}</div>}
      <div className="max-h-48 overflow-y-auto">{runs.map((run) => <button key={run.id} type="button" onClick={() => void openVersion(run.id)}
        className="block w-full border-b border-neutral-800 py-2 text-left text-sm hover:text-[#eeba2b]">{new Date(run.created_at).toLocaleString()} · {run.mode} · v{run.version} · {run.status}</button>)}</div>
    </section>
  </div>
}
