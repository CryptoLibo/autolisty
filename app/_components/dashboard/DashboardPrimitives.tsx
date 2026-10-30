import type { LucideIcon } from "lucide-react"
import { CircleAlert, CircleCheck, CircleHelp, Clock3, DatabaseZap, RefreshCw } from "lucide-react"
import type { ReactNode } from "react"

export type SourceState = "available" | "empty" | "error" | "loading" | "not_connected" | "not_implemented"

const sourceStateStyles: Record<SourceState, { label: string; icon: LucideIcon; className: string }> = {
  available: { label: "Datos disponibles", icon: CircleCheck, className: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20" },
  empty: { label: "Sin registros", icon: DatabaseZap, className: "text-sky-300 bg-sky-400/10 border-sky-400/20" },
  error: { label: "Error de sincronización", icon: CircleAlert, className: "text-rose-300 bg-rose-400/10 border-rose-400/20" },
  loading: { label: "Consultando", icon: RefreshCw, className: "text-sky-300 bg-sky-400/10 border-sky-400/20" },
  not_connected: { label: "Fuente sin conectar", icon: CircleHelp, className: "text-neutral-300 bg-neutral-700/40 border-neutral-700" },
  not_implemented: { label: "Integración pendiente", icon: Clock3, className: "text-amber-200 bg-amber-400/10 border-amber-400/20" },
}

export function SourceBadge({ state }: { state: SourceState }) {
  const { label, icon: Icon, className } = sourceStateStyles[state]
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${className}`}>
    <Icon size={12} aria-hidden="true" />{label}
  </span>
}

export function SectionHeading({ eyebrow, title, description, action }: {
  eyebrow?: string; title: string; description?: string; action?: ReactNode
}) {
  return <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div>{eyebrow && <p className="text-[11px] font-semibold uppercase text-[#eeba2b]">{eyebrow}</p>}
      <h2 className="mt-1 text-lg font-semibold text-neutral-100 sm:text-xl">{title}</h2>
      {description && <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-400">{description}</p>}
    </div>{action}
  </div>
}

export function MetricTile({ label, value, context, icon: Icon, tone = "neutral", title }: {
  label: string; value: string | number; context: string; icon: LucideIcon; tone?: "neutral" | "gold" | "green" | "red";
  title?: string
}) {
  const tones = { neutral: "text-neutral-300 bg-neutral-700/45", gold: "text-[#f1cc61] bg-[#eeba2b]/12",
    green: "text-emerald-300 bg-emerald-400/10", red: "text-rose-300 bg-rose-400/10" }
  return <div className="min-w-0 rounded-md border border-white/8 bg-[#161d22] p-4 shadow-sm transition-colors hover:border-white/15 sm:p-5" title={title}>
    <div className="flex items-start justify-between gap-2">
      <p className="text-xs font-medium text-neutral-400">{label}</p>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${tones[tone]}`}><Icon size={16} aria-hidden="true" /></span>
    </div>
    <p className="mt-3 text-2xl font-semibold tabular-nums text-neutral-100 sm:text-[28px]">{value}</p>
    <p className="mt-1 text-xs leading-5 text-neutral-500">{context}</p>
  </div>
}

export function PendingSource({ title, description, source, state = "not_implemented", icon: Icon }: {
  title: string; description: string; source: string; state?: SourceState; icon: LucideIcon
}) {
  return <div className="flex min-w-0 items-start gap-3 border-t border-white/8 py-4 first:border-t-0">
    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/5 text-neutral-400"><Icon size={17} aria-hidden="true" /></span>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-neutral-200">{title}</h3><SourceBadge state={state} /></div>
      <p className="mt-1 text-xs leading-5 text-neutral-400">{description}</p>
      <p className="mt-1 text-[11px] text-neutral-500">Fuente prevista: {source}</p>
    </div>
  </div>
}

export function LoadingPanel() {
  return <div role="status" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Cargando datos de Automation">
    {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-md border border-white/8 bg-[#161d22]" />)}
  </div>
}
