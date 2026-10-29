"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Activity, ArrowUpRight, BarChart3, CircleAlert, RefreshCw } from "lucide-react"

type Health = { ok: boolean; jobsByStatus?: Record<string, number>; error?: string }
type Section = "overview" | "sales" | "costs" | "traffic" | "advertising" | "pinterest" | "operations"

const sections: Array<{ id: Section; label: string }> = [
  { id: "overview", label: "Overview" }, { id: "sales", label: "Sales" },
  { id: "costs", label: "Costs" }, { id: "traffic", label: "Traffic" },
  { id: "advertising", label: "Advertising" }, { id: "pinterest", label: "Pinterest" },
  { id: "operations", label: "Operations" },
]

const pending: Record<Exclude<Section, "overview" | "operations">, { title: string; source: string; detail: string }> = {
  sales: { title: "Sales and revenue", source: "Etsy orders", detail: "Order and revenue data is not connected yet." },
  costs: { title: "Costs and profitability", source: "Etsy fees and expense records", detail: "Costs need a verified source before profit can be calculated." },
  traffic: { title: "Traffic and conversion", source: "Etsy shop analytics", detail: "Visits and conversion data is not connected yet." },
  advertising: { title: "Advertising performance", source: "Ad accounts", detail: "Campaign metrics are not connected yet." },
  pinterest: { title: "Pinterest performance", source: "Pinterest analytics", detail: "Publishing access does not provide analytics in this dashboard yet." },
}

function EmptySource({ title, source, detail }: { title: string; source: string; detail: string }) {
  return <section className="border-t border-neutral-800 py-8 sm:py-10">
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
      <div><h2 className="text-lg font-semibold text-neutral-100">{title}</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-400">{detail}</p></div>
      <span className="w-fit border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400">Source pending: {source}</span>
    </div>
    <div className="mt-8 flex min-h-40 items-center justify-center border border-dashed border-neutral-800 text-sm text-neutral-500">
      No verified data available
    </div>
  </section>
}

export function DashboardWorkspace() {
  const [section, setSection] = useState<Section>("overview")
  const [health, setHealth] = useState<Health | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/automation/health", { cache: "no-store" })
      const result = await response.json() as Health
      setHealth(response.ok ? result : { ok: false, error: result.error || "Automation data is unavailable." })
    } catch { setHealth({ ok: false, error: "Automation data is unavailable." }) }
    finally { setCheckedAt(new Date()); setLoading(false) }
  }, [])

  useEffect(() => {
    let active = true
    void fetch("/api/automation/health", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as Health
        return response.ok ? result : { ok: false, error: result.error || "Automation data is unavailable." }
      })
      .catch(() => ({ ok: false, error: "Automation data is unavailable." }))
      .then((result) => { if (active) { setHealth(result); setCheckedAt(new Date()); setLoading(false) } })
    return () => { active = false }
  }, [])

  const counts = useMemo(() => health?.ok ? health.jobsByStatus || {} : {}, [health])
  const summary = useMemo(() => ({
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    completed: counts.COMPLETED || 0,
    attention: counts.NEEDS_ATTENTION || 0,
    active: Object.entries(counts).reduce((sum, [status, count]) =>
      status === "COMPLETED" || status === "CANCELED" || status === "NEEDS_ATTENTION" ? sum : sum + count, 0),
  }), [counts])
  const groups = [
    { label: "In progress", value: summary.active, color: "bg-[#eeba2b]" },
    { label: "Needs attention", value: summary.attention, color: "bg-rose-400" },
    { label: "Completed", value: summary.completed, color: "bg-emerald-400" },
    { label: "Canceled", value: counts.CANCELED || 0, color: "bg-neutral-500" },
  ]

  return <div className="space-y-8 pb-12">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-800 pb-5">
      <div><p className="text-xs font-semibold uppercase text-[#eeba2b]">Business control</p>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-100">Dashboard</h1>
        <p className="mt-2 text-sm text-neutral-400">Verified sources only. Operational figures come from Automation.</p></div>
      <button type="button" onClick={() => void refresh()} disabled={loading}
        className="inline-flex items-center gap-2 border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:border-[#eeba2b]/60 disabled:opacity-50">
        <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
      </button>
    </header>

    <nav aria-label="Dashboard sections" className="flex gap-1 overflow-x-auto border-b border-neutral-800">
      {sections.map((item) => <button key={item.id} type="button" onClick={() => setSection(item.id)}
        aria-current={section === item.id ? "page" : undefined}
        className={`shrink-0 border-b-2 px-3 py-3 text-sm transition ${section === item.id
          ? "border-[#eeba2b] text-neutral-100" : "border-transparent text-neutral-400 hover:text-neutral-100"}`}>
        {item.label}</button>)}
    </nav>

    {health?.error && <p role="alert" className="flex items-center gap-2 border-l-2 border-rose-400 pl-3 text-sm text-rose-300">
      <CircleAlert size={16} /> {health.error}</p>}

    {(section === "overview" || section === "operations") && <>
      <section aria-label="Automation summary" className="grid grid-cols-2 gap-px border border-neutral-800 bg-neutral-800 lg:grid-cols-4">
        {[
          ["Production jobs", summary.total], ["In progress", summary.active],
          ["Needs attention", summary.attention], ["Completed", summary.completed],
        ].map(([label, value]) => <div key={label} className="min-h-32 bg-[#10161b] p-5">
          <p className="text-xs text-neutral-400">{label}</p>
          <p className="mt-4 text-3xl font-semibold tabular-nums text-neutral-100">{health?.ok ? value : "--"}</p>
          <p className="mt-2 text-[11px] text-neutral-500">Automation database</p>
        </div>)}
      </section>
      <section className="grid gap-8 border-t border-neutral-800 pt-7 lg:grid-cols-[1fr_280px]">
        <div><h2 className="flex items-center gap-2 text-base font-semibold"><Activity size={17} className="text-[#eeba2b]" /> Production pipeline</h2>
          <p className="mt-1 text-xs text-neutral-500">Actual job counts by outcome</p>
          <div className="mt-6 space-y-4">{groups.map((group) => <div key={group.label}>
            <div className="mb-2 flex justify-between text-sm"><span className="text-neutral-300">{group.label}</span>
              <span className="tabular-nums text-neutral-100">{health?.ok ? group.value : "--"}</span></div>
            <div className="h-2 bg-neutral-800"><div className={`h-full ${group.color}`}
              style={{ width: `${summary.total ? group.value / summary.total * 100 : 0}%` }} /></div>
          </div>)}</div></div>
        <aside className="border-t border-neutral-800 pt-6 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
          <h2 className="flex items-center gap-2 text-base font-semibold"><BarChart3 size={17} className="text-[#eeba2b]" /> Data coverage</h2>
          <p className="mt-4 text-sm leading-6 text-neutral-400">Automation is connected. Sales, costs, traffic and advertising require separate verified sources.</p>
          <p className="mt-5 text-xs text-neutral-500">Automation checked {checkedAt ? checkedAt.toLocaleString() : "not yet"}</p>
          <button onClick={() => setSection("sales")} className="mt-5 inline-flex items-center gap-1 text-sm text-[#eeba2b] hover:underline">
            Explore sources <ArrowUpRight size={15} /></button>
        </aside>
      </section>
    </>}
    {section === "overview" && <div className="grid gap-7 md:grid-cols-2">
      <EmptySource {...pending.sales} /><EmptySource {...pending.costs} />
      <EmptySource {...pending.traffic} /><EmptySource {...pending.pinterest} />
    </div>}
    {section !== "overview" && section !== "operations" && <EmptySource {...pending[section]} />}
  </div>
}
