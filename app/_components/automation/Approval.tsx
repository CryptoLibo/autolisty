"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, Loader2 } from "lucide-react"
import { REJECT_REASONS } from "@/lib/automation/stages"
import { parseBrief, productLabel, type QueueJob } from "./JobCard"
import { buttonPrimary, buttonSecondary, card } from "./ui"

export type ReviewFn = (job: QueueJob, decision: "approve" | "reject", note: string | null) => Promise<boolean>

function BriefDetails({ job }: { job: QueueJob }) {
  const brief = parseBrief(job)
  return (
    <div className="space-y-2 text-xs">
      {brief?.collection ? <div className="text-[#f1cc61]">Colección: {brief.collection}</div> : null}
      {brief?.primaryKeyword ? (
        <div className="text-neutral-300">
          <span className="font-semibold">{brief.primaryKeyword.keyword}</span>
          {brief.primaryKeyword.etsyMonthlySearches != null
            ? ` · ${brief.primaryKeyword.etsyMonthlySearches.toLocaleString("es-ES")} búsquedas/mes`
            : ""}
          {brief.primaryKeyword.competingListings != null
            ? ` · ${brief.primaryKeyword.competingListings.toLocaleString("es-ES")} listings`
            : ""}
          {brief.secondaryKeywords?.length ? (
            <div className="mt-1 text-neutral-500">{brief.secondaryKeywords.map((item) => item.keyword).join(", ")}</div>
          ) : null}
        </div>
      ) : null}
      {brief?.rationale ? <p className="leading-5 text-neutral-400">{brief.rationale}</p> : null}
      <details className="text-neutral-500">
        <summary className="cursor-pointer hover:text-neutral-300">Prompt</summary>
        <p className="mt-2 whitespace-pre-wrap leading-5">{job.sourcePrompt}</p>
      </details>
    </div>
  )
}

/** Motivos de rechazo de un toque más una nota opcional. */
function RejectPanel({ busy, onReject }: { busy: boolean; onReject: (note: string) => void }) {
  const [note, setNote] = useState("")
  return (
    <div className="space-y-2.5">
      <div role="group" aria-label="Motivo del rechazo" className="flex flex-wrap gap-2">
        {REJECT_REASONS.map((reason) => (
          <button
            key={reason}
            type="button"
            disabled={busy}
            onClick={() => onReject(note.trim() ? `${reason}: ${note.trim()}` : reason)}
            className="h-9 rounded-full border border-white/12 bg-white/[0.03] px-3.5 text-[13px] text-neutral-200 transition hover:border-[#eeba2b]/40 disabled:opacity-40"
          >
            {reason}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="reject-note">Nota para Claude</label>
        <input
          id="reject-note"
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Nota opcional (ayuda a Claude a aprender)"
          maxLength={1000}
          className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0b0b0c] px-3 text-sm text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-[#eeba2b]/50"
        />
        <button type="button" disabled={busy || !note.trim()} onClick={() => onReject(note.trim())} className={buttonSecondary}>
          Rechazar
        </button>
      </div>
    </div>
  )
}

export function ApprovalCard({
  job, busy, selecting, selected, onToggleSelect, onReview, onZoom,
}: {
  job: QueueJob
  busy: boolean
  selecting: boolean
  selected: boolean
  onToggleSelect: () => void
  onReview: ReviewFn
  onZoom: (job: QueueJob) => void
}) {
  const [rejecting, setRejecting] = useState(false)
  return (
    <article className={`flex flex-col overflow-hidden ${card} ${selected ? "border-[#eeba2b]/60" : ""}`}>
      <div className="relative">
        <button type="button" onClick={() => (selecting ? onToggleSelect() : onZoom(job))} className="block w-full cursor-zoom-in" aria-label={selecting ? `Seleccionar ${job.productCode}` : `Ampliar ${job.productCode}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${job.sourcePreviewUrl}?w=900`} alt={`Diseño ${job.productCode}`} loading="lazy" className="aspect-square w-full bg-white/[0.03] object-contain" />
        </button>
        {selecting ? (
          <label className="absolute left-3 top-3 flex h-9 items-center gap-2 rounded-lg bg-black/70 px-3 text-sm text-neutral-100">
            <input type="checkbox" checked={selected} onChange={onToggleSelect} className="h-4 w-4 accent-[#eeba2b]" />
            Seleccionar
          </label>
        ) : null}
        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-between">
          <span className="rounded-md bg-black/60 px-2 py-0.5 text-xs text-neutral-100">{productLabel(job.productType)}</span>
          <span className="rounded-md bg-black/60 px-2 py-0.5 font-mono text-xs text-neutral-100">{job.productCode}</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <BriefDetails job={job} />
        {selecting ? null : rejecting ? (
          <RejectPanel busy={busy} onReject={(note) => void onReview(job, "reject", note)} />
        ) : (
          <div className="mt-auto flex gap-2">
            <button type="button" disabled={busy} onClick={() => void onReview(job, "approve", null)} className={`${buttonPrimary} flex-1`}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : null}
              Aprobar
            </button>
            <button type="button" disabled={busy} onClick={() => setRejecting(true)} className={`${buttonSecondary} flex-1`}>
              Rechazar
            </button>
          </div>
        )}
      </div>
    </article>
  )
}

/** Un diseño cada vez, a pantalla completa: pensado para el iPhone (U4). */
export function ApprovalFlow({ jobs, onReview, onZoom, onClose }: {
  jobs: QueueJob[]
  onReview: ReviewFn
  onZoom: (job: QueueJob) => void
  onClose: () => void
}) {
  const [initialTotal] = useState(jobs.length)
  const [done, setDone] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const remaining = useMemo(() => jobs.filter((job) => !done.includes(job.id)), [jobs, done])
  const current = remaining[0] || null

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [onClose])

  async function review(decision: "approve" | "reject", note: string | null) {
    if (!current) return
    setBusy(true)
    const ok = await onReview(current, decision, note)
    setBusy(false)
    if (ok) {
      setDone((ids) => [...ids, current.id])
      setRejecting(false)
    }
  }

  const position = Math.min(done.length + 1, Math.max(initialTotal, 1))
  const total = Math.max(initialTotal, done.length + remaining.length)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0b0c]" role="dialog" aria-modal="true" aria-label="Aprobar diseños">
      <header className="flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top),12px)] pb-2">
        <button type="button" onClick={onClose} aria-label="Cerrar" className="flex h-11 w-11 items-center justify-center text-neutral-200">
          <ChevronLeft size={24} aria-hidden="true" />
        </button>
        <div className="text-center">
          <div className="text-[15px] font-semibold">Por aprobar</div>
          {current ? <div className="text-xs text-neutral-400">{position} de {total}</div> : null}
        </div>
        <span className="w-11" />
      </header>
      <div className="mx-4 h-1 rounded-full bg-white/10">
        <div className="h-1 rounded-full bg-[#eeba2b] transition-all" style={{ width: `${total ? (done.length / total) * 100 : 100}%` }} />
      </div>

      {current ? (
        <>
          <div className="mx-auto flex w-full max-w-2xl min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-4">
            <button type="button" onClick={() => onZoom(current)} aria-label="Ampliar diseño" className="relative min-h-[45vh] flex-1 overflow-hidden rounded-2xl bg-white/[0.03]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={current.id} src={`${current.sourcePreviewUrl}?w=900`} alt={`Diseño ${current.productCode}`} className="absolute inset-0 h-full w-full object-contain" />
              <span className="absolute bottom-3 left-3 rounded-md bg-black/60 px-2 py-0.5 text-xs text-neutral-100">{productLabel(current.productType)}</span>
              <span className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-0.5 text-xs text-neutral-100">Toca para ampliar</span>
            </button>
            <div className="font-mono text-xs text-[#eeba2b]">{current.productCode}</div>
            <BriefDetails job={current} />
            {rejecting ? <RejectPanel busy={busy} onReject={(note) => void review("reject", note)} /> : null}
          </div>
          <div className="mx-auto grid w-full max-w-2xl grid-cols-2 gap-2.5 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)]">
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejecting((value) => !value)}
              className="h-14 rounded-xl border border-white/15 bg-[#141416] text-base font-medium text-neutral-100 disabled:opacity-40"
            >
              {rejecting ? "Volver" : "Rechazar"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void review("approve", null)}
              className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-[#eeba2b] text-base font-semibold text-neutral-950 disabled:opacity-40"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : null}
              Aprobar
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="text-lg font-semibold">Todo revisado</div>
          <div className="text-sm text-neutral-400">{done.length} {done.length === 1 ? "diseño" : "diseños"} en esta sesión.</div>
          <button type="button" onClick={onClose} className={`${buttonPrimary} mt-2`}>Volver a Automation</button>
        </div>
      )}
    </div>
  )
}
