"use client"

import { useState } from "react"
import { Loader2, RotateCcw } from "lucide-react"
import { PRODUCT_OPTIONS, type ProductType } from "@/lib/products"
import type { AutomationJob, AutomationJobEvent, AutomationJobFile } from "@/lib/automation/types"
import { PIPELINE_STEPS, STATUS_LABELS, pipelineStepOf, timeAgo } from "@/lib/automation/stages"
import { buttonDanger, buttonSecondary, card } from "./ui"

export type QueueJob = AutomationJob & {
  files: AutomationJobFile[]
  sourcePreviewUrl: string
  /** Lista ligera: el título del SEO y si hay miniatura, ya calculados en el servidor. */
  seoTitle?: string | null
  hasThumbnail?: boolean
}

export type DesignBriefView = {
  primaryKeyword?: { keyword: string; etsyMonthlySearches?: number | null; competingListings?: number | null } | null
  secondaryKeywords?: Array<{ keyword: string }>
  collection?: string | null
  rationale?: string | null
  imageUrl?: string | null
}

export function parseBrief(job: AutomationJob): DesignBriefView | null {
  if (!job.briefJson) return null
  try {
    return JSON.parse(job.briefJson) as DesignBriefView
  } catch {
    return null
  }
}

export function seoTitle(job: AutomationJob & { seoTitle?: string | null }): string | null {
  if (job.seoTitle) return job.seoTitle
  if (!job.seoJson) return null
  try {
    return (JSON.parse(job.seoJson) as { title?: string }).title || null
  } catch {
    return null
  }
}

export function productLabel(productType: ProductType) {
  return PRODUCT_OPTIONS.find((product) => product.value === productType)?.label || productType
}

export function hasThumbnail(job: QueueJob) {
  if (typeof job.hasThumbnail === "boolean") return job.hasThumbnail
  return job.files.some((file) =>
    (file.slotKey === "source:primary" || file.slotKey === "listing:1") && file.r2Key && file.status !== "DELETED"
  )
}

const EDIT_DRAFT_URL = (listingId: string) => `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`

type Actions = {
  busy: boolean
  onZoom: (job: QueueJob) => void
  onRetry: (job: QueueJob) => void
  onRestart: (job: QueueJob) => void
  onDiscard: (job: QueueJob) => void
  onPriority: (job: QueueJob) => void
  onCancel: (job: QueueJob) => void
}

function StageBar({ job }: { job: QueueJob }) {
  const current = pipelineStepOf(job.status, job.resumeStatus)
  const issue = job.status === "NEEDS_ATTENTION" || job.status === "RETRY_WAIT"
  return (
    <ol aria-label="Etapas" className="grid grid-cols-6 gap-1.5">
      {PIPELINE_STEPS.map((step, index) => {
        const done = index < current
        const isCurrent = index === current
        return (
          <li key={step} aria-current={isCurrent ? "step" : undefined} className="min-w-0">
            <div className={`h-1 rounded-full ${
              done ? "bg-[#eeba2b]" : isCurrent ? (issue ? "bg-orange-400" : "bg-[#f7d875]") : "bg-white/10"
            }`} />
            <div className={`mt-1.5 hidden truncate text-[11px] sm:block ${isCurrent ? "font-medium text-neutral-100" : "text-neutral-500"}`}>
              {step}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function EventHistory({ jobId }: { jobId: string }) {
  const [events, setEvents] = useState<AutomationJobEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (events) return
    try {
      const response = await fetch(`/api/automation/jobs/${jobId}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "No se pudo cargar el historial.")
      setEvents(data.events || [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el historial.")
    }
  }

  return (
    <details onToggle={(event) => { if ((event.target as HTMLDetailsElement).open) void load() }} className="text-xs">
      <summary className="cursor-pointer text-neutral-400 hover:text-neutral-200">Historial de eventos</summary>
      <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1">
        {error ? <p className="text-red-300">{error}</p> : null}
        {!events && !error ? <Loader2 size={14} className="animate-spin text-neutral-500" aria-label="Cargando" /> : null}
        {events?.slice().reverse().map((event) => (
          <div key={event.id} className="flex gap-3 leading-5">
            <span className="w-16 shrink-0 text-neutral-500">{timeAgo(event.createdAt).replace("hace ", "")}</span>
            <span className="min-w-0 text-neutral-300">
              {event.toStatus ? STATUS_LABELS[event.toStatus] : event.eventType}
              {event.message ? <span className="text-neutral-500"> · {event.message}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </details>
  )
}

export function JobCard({ job, actions }: { job: QueueJob; actions: Actions }) {
  const issue = job.status === "NEEDS_ATTENTION" || job.status === "RETRY_WAIT"
  const title = seoTitle(job) || parseBrief(job)?.primaryKeyword?.keyword || job.sourcePrompt
  const thumbnail = hasThumbnail(job)

  return (
    <article className={`flex gap-4 p-4 ${card} ${issue ? "border-orange-400/25" : ""}`}>
      <button
        type="button"
        onClick={() => thumbnail && actions.onZoom(job)}
        disabled={!thumbnail}
        aria-label={`Ampliar ${job.productCode}`}
        className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-white/[0.04] sm:h-24 sm:w-28"
      >
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${job.sourcePreviewUrl}?w=480`} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : null}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 font-mono text-xs text-[#eeba2b]">{job.productCode}</span>
            <span className="truncate text-xs text-neutral-500">{productLabel(job.productType)}</span>
          </div>
          <span className="shrink-0 text-xs text-neutral-500">{timeAgo(job.updatedAt)}</span>
        </div>
        <h3 className="line-clamp-2 text-sm font-medium leading-5 text-neutral-100">{title}</h3>
        <StageBar job={job} />
        <div className={`text-xs ${issue ? "text-orange-300" : "text-neutral-400"}`}>{STATUS_LABELS[job.status]}</div>
        {issue && job.lastError ? <p className="line-clamp-3 text-xs leading-5 text-orange-200/80">{job.lastError}</p> : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
          {job.etsyDraftId && job.status !== "ETSY_ACTIVE" && job.status !== "COMPLETED" ? (
            <a href={EDIT_DRAFT_URL(job.etsyDraftId)} target="_blank" rel="noreferrer" className="text-[#eeba2b] hover:text-[#f7d875]">Editar draft en Etsy</a>
          ) : null}
          {job.etsyUrl ? (
            <a href={job.etsyUrl} target="_blank" rel="noreferrer" className="text-[#eeba2b] hover:text-[#f7d875]">Ver listing</a>
          ) : null}
        </div>

        {issue ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={actions.busy} onClick={() => actions.onRetry(job)} className={buttonSecondary}>
              {actions.busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              Reintentar
            </button>
            {!job.etsyUrl && parseBrief(job)?.imageUrl ? (
              <button type="button" disabled={actions.busy} onClick={() => actions.onRestart(job)} className={buttonSecondary}>
                Empezar de nuevo
              </button>
            ) : null}
            {!job.etsyUrl ? (
              <button type="button" disabled={actions.busy} onClick={() => actions.onDiscard(job)} className={buttonDanger}>
                Descartar
              </button>
            ) : null}
          </div>
        ) : null}

        {job.status === "QUEUED_LOCAL" || job.status === "LOCAL_CLAIMED" ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={actions.busy} onClick={() => actions.onPriority(job)} className={buttonSecondary}>
              {job.priority > 0 ? "Quitar prioridad" : "Dar prioridad"}
            </button>
            <button type="button" disabled={actions.busy} onClick={() => actions.onCancel(job)} className={buttonDanger}>
              Cancelar
            </button>
          </div>
        ) : null}

        <EventHistory jobId={job.id} />
      </div>
    </article>
  )
}
