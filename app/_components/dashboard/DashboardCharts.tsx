import type { DashboardOverview } from "@/lib/dashboard/overview"

const segments = [
  { key: "active", label: "En curso", color: "#eeba2b" },
  { key: "attention", label: "Requieren atención", color: "#fb7185" },
  { key: "completed", label: "Completados", color: "#34d399" },
  { key: "canceled", label: "Cancelados", color: "#64748b" },
] as const

export function StatusDonut({ data }: { data: DashboardOverview }) {
  const circles = segments.map((segment, index) => {
    const value = data[segment.key]
    const length = data.total ? value / data.total * 100 : 0
    const offset = data.total ? segments.slice(0, index).reduce((sum, previous) => sum + data[previous.key] / data.total * 100, 0) : 0
    return <circle key={segment.key} cx="50" cy="50" r="38" fill="none" stroke={segment.color}
      strokeWidth="11" pathLength="100" strokeDasharray={`${length} ${100 - length}`}
      strokeDashoffset={-offset} transform="rotate(-90 50 50)" />
  })
  return <div className="flex flex-col items-center gap-5 sm:flex-row">
    <div className="relative h-40 w-40 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label={`Distribución de ${data.total} trabajos por estado`}>
        <circle cx="50" cy="50" r="38" fill="none" stroke="#293138" strokeWidth="11" />{circles}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <strong className="text-3xl font-semibold tabular-nums text-white">{data.total}</strong>
        <span className="text-[11px] text-neutral-400">trabajos</span>
      </div>
    </div>
    <div className="grid w-full grid-cols-2 gap-x-4 gap-y-3">
      {segments.map((item) => <div key={item.key} className="min-w-0">
        <div className="flex items-center gap-2 text-xs text-neutral-400"><span className="h-2 w-2 rounded-sm" style={{ backgroundColor: item.color }} />{item.label}</div>
        <p className="mt-1 pl-4 text-base font-semibold tabular-nums text-neutral-100">{data[item.key]}</p>
      </div>)}
    </div>
  </div>
}

export function ProductionTrend({ data }: { data: DashboardOverview }) {
  const max = Math.max(1, ...data.trend.map((point) => point.count))
  const total = data.trend.reduce((sum, point) => sum + point.count, 0)
  if (!total) return <div className="flex h-44 items-center justify-center rounded-md border border-dashed border-white/10 bg-white/[0.02] px-5 text-center text-sm text-neutral-400">
    Aún no hay trabajos creados en este periodo.
  </div>
  return <div>
    <div role="img" aria-label={`Trabajos creados por ${data.period === "90d" ? "semana" : "día"}; total ${total}`}
      className="flex h-40 items-end gap-1 border-b border-white/10 pb-1 sm:gap-1.5">
      {data.trend.map((point) => <div key={point.date} tabIndex={0} className="group relative flex h-full min-w-0 flex-1 items-end focus-visible:outline-2 focus-visible:outline-[#eeba2b]" title={`${point.date} (UTC): ${point.count} trabajos`} aria-label={`${point.date}: ${point.count} trabajos`}>
        <div className={`w-full rounded-t-sm transition-colors ${point.count ? "bg-[#dcae34] group-hover:bg-[#f6cd68]" : "bg-white/5"}`}
          style={{ height: `${point.count ? Math.max(10, point.count / max * 100) : 3}%` }} />
      </div>)}
    </div>
    <div className="mt-2 flex justify-between text-[11px] text-neutral-500">
      <span>{data.trend[0]?.date}</span><span>Altas por {data.period === "90d" ? "semana" : "día"} (UTC)</span>
      <span>{data.trend[data.trend.length - 1]?.date}</span>
    </div>
  </div>
}
