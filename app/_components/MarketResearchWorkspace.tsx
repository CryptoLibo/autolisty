"use client"

import { useEffect, useState } from "react"
import { BookOpen, Plus, Search, Sparkles, RefreshCw, Square } from "lucide-react"
import { PRODUCT_OPTIONS, type ProductType } from "@/lib/products"
import type { ResearchInvestigation, ResearchMode } from "@/lib/research/contracts"

type MarketView = { investigation: ResearchInvestigation | null;
  runs: Array<{ id: string; status: string; recovery_state: string; coverage_json: string; usage_json: string; started_at: string }>;
  opportunities: Array<{ id: string; title: string; rationale: string; selected: number }>;
  evidence: Array<{ id: string; metric: string; numeric_value: number; unit: string; period: string; provider: string; source_url: string; kind: string; uncertainty: string | null }>;
  links: Array<{ opportunity_id: string; evidence_id: string }> }
type SourceStatus = { provider: string; state: string; reason?: string; capabilities: string[] }

export function MarketResearchWorkspace({ onCreatePrompts }: { onCreatePrompts?: (source: { investigationId: string; opportunityId: string; brief: string }) => void }) {
  const [investigations, setInvestigations] = useState<ResearchInvestigation[]>([])
  const [title, setTitle] = useState("")
  const [query, setQuery] = useState("")
  const [mode, setMode] = useState<ResearchMode>("open")
  const [productType, setProductType] = useState<ProductType | "">("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectedInvestigationId, setSelectedInvestigationId] = useState("")
  const [marketView, setMarketView] = useState<MarketView | null>(null)
  const [statuses, setStatuses] = useState<SourceStatus[]>([])
  const [diagnostics, setDiagnostics] = useState<Array<SourceStatus & { lastCheckAt: string | null }>>([])
  const [aluraDiagnostic, setAluraDiagnostic] = useState<{
    state: string; plan: string | null; creditsRemaining: number | null; creditsCost: number | null;
    latencyMs: number; errorCode: string | null
  } | null>(null)
  const [aluraBudget, setAluraBudget] = useState<{
    maximum: number; minimumReserve: number; spent: number; reserved: number; maintenanceHealthy: boolean
  } | null>(null)
  const [fullResearchEnabled, setFullResearchEnabled] = useState(false)
  const [checkingAlura, setCheckingAlura] = useState(false)
  const [running, setRunning] = useState(false)
  const [manual, setManual] = useState({ title: "", metric: "", value: "", unit: "", period: "", sourceUrl: "", note: "" })

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/research/investigations", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Unable to load investigations.")
        setInvestigations(data.investigations)
        setError("")
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load investigations.")
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => { void loadMarket(selectedInvestigationId) }, [selectedInvestigationId])

  async function loadMarket(id: string) {
    try {
      const response = await fetch(`/api/research/market${id ? `?investigationId=${encodeURIComponent(id)}` : ""}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Research data unavailable.")
      setStatuses(data.statuses || [])
      setDiagnostics(data.diagnostics || [])
      setAluraBudget(data.aluraBudget || null)
      setFullResearchEnabled(data.fullResearchEnabled === true)
      setMarketView(data.result || null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Research data unavailable.") }
  }

  async function runResearch(force = false) {
    if (!selectedInvestigationId) return
    if (!window.confirm("This research can use paid AI and commercial API credits. Authorize this run?")) return
    if (force && !window.confirm("Fresh research may consume provider credits even when similar results exist. Continue?")) return
    setRunning(true); setError("")
    try {
      const item = investigations.find((investigation) => investigation.id === selectedInvestigationId)
      const response = await fetch("/api/research/market", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ investigationId: selectedInvestigationId, request: item?.query || item?.title,
          force, confirmedPaidResearch: true }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Research failed.")
      setMarketView(data.result)
      setInvestigations((current) => current.map((investigation) => investigation.id === selectedInvestigationId
        ? { ...investigation, status: data.result.investigation.status } : investigation))
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Research failed.") }
    finally { setRunning(false) }
  }

  async function checkAlura() {
    if (!window.confirm("Check Alura account usage? This documented operation costs 0 API credits and sends one request.")) return
    setCheckingAlura(true); setError("")
    try {
      const response = await fetch("/api/research/market/alura/diagnostics", { method: "POST" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || data.state || "Alura diagnostic failed.")
      setAluraDiagnostic(data)
      await loadMarket(selectedInvestigationId)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Alura diagnostic failed.") }
    finally { setCheckingAlura(false) }
  }

  async function cancelResearch(runId: string) {
    try {
      const response = await fetch("/api/research/market/cancel", { method: "POST",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ runId }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Cancellation failed.")
      await loadMarket(selectedInvestigationId)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Cancellation failed.") }
  }

  async function toggleOpportunity(id: string, selected: boolean) {
    const response = await fetch("/api/research/market/select", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ opportunityIds: [id], selected }) })
    if (response.ok) setMarketView((current) => current ? { ...current,
      opportunities: current.opportunities.map((item) => item.id === id ? { ...item, selected: selected ? 1 : 0 } : item) } : current)
    else setError((await response.json()).error || "Selection failed.")
  }

  async function addManualEvidence(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("")
    try {
      const response = await fetch("/api/research/market/manual", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...manual, value: Number(manual.value), investigationId: selectedInvestigationId }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Manual import failed.")
      setManual({ title: "", metric: "", value: "", unit: "", period: "", sourceUrl: "", note: "" })
      await loadMarket(selectedInvestigationId)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Manual import failed.") }
  }

  async function createInvestigation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError("")
    try {
      const response = await fetch("/api/research/investigations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, query, mode, suggestedProductType: productType || null }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to save investigation.")
      setInvestigations((current) => [data.investigation, ...current])
      setSelectedInvestigationId(data.investigation.id)
      setTitle("")
      setQuery("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save investigation.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-neutral-800 pb-5">
        <h2 className="text-xl font-semibold text-neutral-100">Market Research</h2>
        <p className="mt-1 text-sm text-neutral-400">Investigations</p>
      </div>

      <form onSubmit={createInvestigation} className="grid gap-4 border-b border-neutral-800 pb-6 lg:grid-cols-[1fr_1fr_auto]">
        <label className="space-y-2 text-sm text-neutral-300">
          <span>Investigation name</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={120}
            className="w-full border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100" placeholder="e.g. Autumn wall art" />
        </label>
        <label className="space-y-2 text-sm text-neutral-300">
          <span>Topic or keyword</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={500}
            className="w-full border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100" placeholder="Optional direction" />
        </label>
        <button type="submit" disabled={saving} className="self-end inline-flex items-center justify-center gap-2 border border-[#eeba2b] bg-[#eeba2b] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">
          <Plus size={16} /> {saving ? "Saving..." : "Save"}
        </button>
        <label className="space-y-2 text-sm text-neutral-300">
          <span>Research mode</span>
          <select value={mode} onChange={(event) => setMode(event.target.value as ResearchMode)} className="w-full border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100">
            <option value="open">Open</option><option value="directed">Directed</option>
          </select>
        </label>
        <label className="space-y-2 text-sm text-neutral-300">
          <span>Product interest (not a filter)</span>
          <select value={productType} onChange={(event) => setProductType(event.target.value as ProductType | "")} className="w-full border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100">
            <option value="">Any product</option>
            {PRODUCT_OPTIONS.map((product) => <option key={product.value} value={product.value}>{product.label}</option>)}
          </select>
        </label>
      </form>

      {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
      <section className="border-b border-neutral-800 pb-5">
        <h3 className="mb-3 text-sm font-semibold text-neutral-200">Research sources</h3>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">{(diagnostics.length ? diagnostics : statuses).map((source) => <span key={source.provider}
          title={source.reason || source.capabilities.join(", ")} className={source.state === "AVAILABLE" ? "text-emerald-300" : "text-neutral-500"}>
          {source.provider}: {source.state.toLowerCase().replace("_", " ")}</span>)}</div>
        <button type="button" disabled={checkingAlura} onClick={() => void checkAlura()}
          className="mt-3 border border-neutral-700 px-3 py-1 text-xs disabled:opacity-50">
          {checkingAlura ? "Checking Alura..." : "Check Alura usage (free)"}
        </button>
        {aluraDiagnostic && <p className="mt-2 text-xs text-neutral-300">Alura: {aluraDiagnostic.state} · plan {aluraDiagnostic.plan || "unknown"}
          {" · "}remaining {aluraDiagnostic.creditsRemaining ?? "unknown"} · cost {aluraDiagnostic.creditsCost ?? "unknown"}
          {" · "}{aluraDiagnostic.latencyMs} ms{aluraDiagnostic.errorCode ? ` · ${aluraDiagnostic.errorCode}` : ""}</p>}
        {aluraBudget && <p className={`mt-2 text-xs ${aluraBudget.maintenanceHealthy ? "text-emerald-300" : "text-amber-300"}`}>
          Retention maintenance: {aluraBudget.maintenanceHealthy ? "healthy" : "inactive - Alura calls blocked"}
          {" · "}test credits {aluraBudget.spent + aluraBudget.reserved}/{aluraBudget.maximum}
          {" · "}minimum reserve {aluraBudget.minimumReserve}
        </p>}
      </section>
      <section aria-label="Saved investigations">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-200"><BookOpen size={16} /> Saved investigations</h3>
        {loading ? <p className="text-sm text-neutral-400">Loading...</p> : investigations.length === 0 ? (
          <p className="text-sm text-neutral-400">No investigations saved yet.</p>
        ) : <div className="divide-y divide-neutral-800 border-y border-neutral-800">
          {investigations.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div><p className="font-medium text-neutral-100">{item.title}</p><p className="text-xs text-neutral-400">{item.query || "Open exploration"} · {item.mode} · {new Date(item.createdAt).toLocaleString()}</p></div>
            <div className="flex items-center gap-3"><span className="text-xs text-amber-300">{item.status.toLowerCase()}</span>
              <button type="button" onClick={() => setSelectedInvestigationId(item.id)} className="border border-neutral-700 px-3 py-1 text-xs text-neutral-100">Open</button></div>
          </div>)}
        </div>}
      </section>
      {selectedInvestigationId && <section className="space-y-4 border-t border-neutral-800 pt-5">
        <div className="flex flex-wrap items-center gap-3"><h3 className="mr-auto flex items-center gap-2 font-medium"><Search size={16} /> {investigations.find((item) => item.id === selectedInvestigationId)?.title}</h3>
          <button type="button" onClick={() => void loadMarket(selectedInvestigationId)} title="Refresh results" className="border border-neutral-700 p-2"><RefreshCw size={16} /></button>
          <button type="button" disabled={running || !fullResearchEnabled || !statuses.some((source) => source.state === "AVAILABLE" && source.provider !== "marketplace_insights")}
            onClick={() => void runResearch()} className="inline-flex items-center gap-2 bg-[#eeba2b] px-3 py-2 text-sm font-semibold text-black disabled:opacity-50"><Sparkles size={15} />{running ? "Researching..." : "Research"}</button></div>
        {!!marketView?.runs.length && fullResearchEnabled && statuses.some((source) => source.state === "AVAILABLE" && source.provider !== "marketplace_insights") &&
          <button type="button" disabled={running} onClick={() => void runResearch(true)} className="border border-neutral-700 px-3 py-1 text-sm">Run fresh research</button>}
        {!statuses.some((source) => source.state === "AVAILABLE" && source.provider !== "marketplace_insights") && <p className="text-sm text-amber-300">Live sources are not enabled. Manual evidence remains available without account calls.</p>}
        {!fullResearchEnabled && <p className="text-sm text-amber-300">Full research awaits a separate approval. The one-keyword trial is independent.</p>}
        {marketView?.runs.map((run) => {
          const coverage = JSON.parse(run.coverage_json || "{}") as { consulted?: string[]; skipped?: Array<{ provider: string; reason: string }>; warnings?: string[] }
          const usage = JSON.parse(run.usage_json || "{}") as { creditsEstimated?: number; creditsReported?: number; queriesExecuted?: number }
          return <div key={run.id} className="border-b border-neutral-800 pb-3 text-xs text-neutral-400">
            <p>{new Date(run.started_at).toLocaleString()} · {run.status} · {run.recovery_state} · {usage.queriesExecuted || 0} queries · estimated {usage.creditsEstimated || 0} Alura credits · reported {usage.creditsReported ?? "unknown"}</p>
            {run.status === "RUNNING" && run.recovery_state !== "CANCEL_REQUESTED" && <button type="button"
              onClick={() => void cancelResearch(run.id)} className="inline-flex items-center gap-1 text-amber-300"><Square size={12} /> Cancel</button>}
            <p>Consulted: {coverage.consulted?.join(", ") || "none"}</p>
            {coverage.skipped?.map((item, index) => <p key={index}>{item.provider}: {item.reason}</p>)}
            {coverage.warnings?.map((item, index) => <p key={index}>{item}</p>)}
          </div>
        })}
        <h4 className="font-medium">Opportunities</h4>
        {!marketView?.opportunities.length && <p className="text-sm text-neutral-400">Insufficient evidence for opportunities.</p>}
        {marketView?.opportunities.map((item) => {
          const linkedIds = marketView.links.filter((link) => link.opportunity_id === item.id).map((link) => link.evidence_id)
          const evidence = marketView.evidence.filter((metric) => linkedIds.includes(metric.id))
          return <article key={item.id} className="space-y-2 border-b border-neutral-800 py-3">
            <div className="flex flex-wrap items-center gap-3"><h5 className="mr-auto font-semibold">{item.title}</h5>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!item.selected} onChange={(event) => void toggleOpportunity(item.id, event.target.checked)} /> Keep</label>
              <button type="button" disabled={!evidence.length} onClick={() => onCreatePrompts?.({ investigationId: selectedInvestigationId, opportunityId: item.id,
                brief: `${item.title}. ${item.rationale}` })} className="border border-[#eeba2b] px-3 py-1 text-xs text-[#eeba2b]">Create prompts</button></div>
            <p className="text-sm text-neutral-400">{item.rationale}</p>
            {!evidence.length && <p className="text-xs text-amber-300">Evidence expired or unavailable; refresh before using this opportunity.</p>}
            <div className="grid gap-2 md:grid-cols-2">{evidence.map((metric) => <div key={metric.id} className="border-l border-neutral-700 pl-3 text-xs">
              <p>{metric.metric.replaceAll("_", " ")}: {metric.numeric_value} {metric.unit} · {metric.kind === "provider_estimate" ? "estimate" : metric.kind}</p>
              <p className="text-neutral-500">{metric.provider} · {metric.period} · <a href={metric.source_url} target="_blank" rel="noreferrer" className="underline">source</a></p>
              {metric.uncertainty && <p className="text-amber-300">{metric.uncertainty}</p>}
            </div>)}</div>
          </article>
        })}
        <form onSubmit={(event) => void addManualEvidence(event)} className="space-y-3 border-t border-neutral-800 pt-5">
          <h4 className="font-medium">Import Marketplace Insights observation</h4>
          <p className="text-xs text-neutral-400">Owner-provided evidence is labeled unverified and is never presented as provider-confirmed data.</p>
          <div className="grid gap-3 md:grid-cols-2">{([
            ["title", "Opportunity or subject"], ["metric", "Metric name"], ["value", "Numeric value"],
            ["unit", "Unit"], ["period", "Measurement period"], ["sourceUrl", "HTTPS source URL"],
            ["note", "Limitations or uncertainty"],
          ] as const).map(([key, label]) => <label key={key} className="space-y-1 text-xs">{label}<input required value={manual[key]}
            type={key === "value" ? "number" : key === "sourceUrl" ? "url" : "text"} step={key === "value" ? "any" : undefined}
            onChange={(event) => setManual((current) => ({ ...current, [key]: event.target.value }))}
            className="w-full border border-neutral-700 bg-neutral-950 px-3 py-2" /></label>)}</div>
          <button type="submit" className="border border-neutral-600 px-3 py-2 text-sm">Save observation</button>
        </form>
      </section>}
    </div>
  )
}
