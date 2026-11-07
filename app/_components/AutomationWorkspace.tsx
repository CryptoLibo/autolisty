"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Database,
  FileImage,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react"
import { PRODUCT_OPTIONS, type ProductType } from "@/lib/products"
import { ImageLightbox } from "./ImageLightbox"
import type {
  AutomationJob,
  AutomationAgent,
  AutomationJobFile,
  AutomationPipelineMode,
  EtsyDraftPoolItem,
} from "@/lib/automation/types"

type QueueJob = AutomationJob & {
  files: AutomationJobFile[]
  sourcePreviewUrl: string
}

type DraftSummaryItem = {
  productType: ProductType
  status: EtsyDraftPoolItem["status"]
  count: number
}

const STATUS_LABELS: Partial<Record<AutomationJob["status"], string>> = {
  CREATED: "Creating intake",
  SOURCE_READY: "Source ready",
  PENDING_APPROVAL: "Waiting for your approval",
  QUEUED_LOCAL: "Approved · waiting for Automaty to sync",
  LOCAL_CLAIMED: "In Automaty's local queue",
  LOCAL_BUILDING: "Building mockups",
  LOCAL_VALIDATING: "Validating listing folder",
  LOCAL_UPLOADING: "Returning production files",
  LOCAL_COMPLETE: "Local production complete",
  DRAFT_ASSIGNED: "Etsy draft assigned",
  SEO_GENERATING: "Generating Etsy SEO",
  SEO_READY: "Etsy SEO ready",
  PINTEREST_SEO_GENERATING: "Generating Pinterest SEO",
  PINTEREST_SEO_READY: "Pinterest SEO ready",
  DELIVERY_PREPARING: "Preparing delivery",
  DELIVERY_READY: "Delivery ready",
  ETSY_TEXT_SYNCING: "Syncing Etsy text",
  ETSY_MEDIA_SYNCING: "Syncing Etsy media",
  ETSY_FILE_SYNCING: "Syncing customer file",
  ETSY_VIDEO_SYNCING: "Syncing Etsy video",
  WAITING_ETSY_REVIEW: "Draft ready for review",
  ETSY_ACTIVE: "Published on Etsy",
  PINTEREST_PUBLISHING: "Publishing Pinterest pins",
  COMPLETED: "Completed",
  RETRY_WAIT: "Retry scheduled",
  NEEDS_ATTENTION: "Needs attention",
  CANCELED: "Canceled",
}

function productLabel(productType: ProductType) {
  return PRODUCT_OPTIONS.find((product) => product.value === productType)?.label || productType
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function formatBytes(value: number | null) {
  if (!value) return "Unknown size"
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.ceil(value / 1024)} KB`
}

type DesignBriefView = {
  primaryKeyword?: { keyword: string; etsyMonthlySearches?: number | null; competingListings?: number | null } | null
  secondaryKeywords?: Array<{ keyword: string }>
  collection?: string | null
  rationale?: string | null
}

function parseBrief(job: AutomationJob): DesignBriefView | null {
  if (!job.briefJson) return null
  try {
    return JSON.parse(job.briefJson) as DesignBriefView
  } catch {
    return null
  }
}

const AGENT_ONLINE_WINDOW_MS = 3 * 60 * 1000

function isAgentOnline(agent: AutomationAgent) {
  return Boolean(agent.lastSeenAt && Date.now() - new Date(agent.lastSeenAt).getTime() < AGENT_ONLINE_WINDOW_MS)
}

function isFinished(status: AutomationJob["status"]) {
  return status === "COMPLETED" || status === "CANCELED"
}

export function AutomationWorkspace() {
  const [jobs, setJobs] = useState<QueueJob[]>([])
  const [pipelineMode, setPipelineMode] = useState<AutomationPipelineMode>("RUNNING")
  const [agents, setAgents] = useState<AutomationAgent[]>([])
  const [managingJobId, setManagingJobId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<EtsyDraftPoolItem[]>([])
  const [draftSummary, setDraftSummary] = useState<DraftSummaryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageTone, setMessageTone] = useState<"success" | "error">("success")

  const [productType, setProductType] = useState<ProductType>("png_designs")
  const [sourcePrompt, setSourcePrompt] = useState("")
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [draftProductType, setDraftProductType] = useState<ProductType>("png_designs")
  const [draftIds, setDraftIds] = useState("")
  const [draftSubmitting, setDraftSubmitting] = useState(false)
  const [pipelineUpdating, setPipelineUpdating] = useState(false)
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null)
  const [reviewingJobId, setReviewingJobId] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})
  const [lightbox, setLightbox] = useState<{ src: string; alt: string; caption: string } | null>(null)

  const loadDashboard = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true)
    try {
      const [jobsResponse, draftsResponse] = await Promise.all([
        fetch("/api/automation/jobs", { cache: "no-store" }),
        fetch("/api/automation/drafts", { cache: "no-store" }),
      ])
      const jobsData = await jobsResponse.json()
      const draftsData = await draftsResponse.json()
      if (!jobsResponse.ok) throw new Error(jobsData.error || "Unable to load production queue.")
      if (!draftsResponse.ok) throw new Error(draftsData.error || "Unable to load Etsy drafts.")

      setJobs(jobsData.jobs || [])
      setPipelineMode(jobsData.pipelineMode || "RUNNING")
      setAgents(jobsData.agents || [])
      setDrafts(draftsData.drafts || [])
      setDraftSummary(draftsData.summary || [])
    } catch (error) {
      setMessageTone("error")
      setMessage(error instanceof Error ? error.message : "Unable to load Automation.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadDashboard(), 0)
    const interval = window.setInterval(() => void loadDashboard(true), 15000)
    return () => {
      window.clearTimeout(initialLoad)
      window.clearInterval(interval)
    }
  }, [loadDashboard])

  const selectedSourcePreview = useMemo(
    () => sourceFile ? URL.createObjectURL(sourceFile) : null,
    [sourceFile]
  )

  useEffect(
    () => () => {
      if (selectedSourcePreview) URL.revokeObjectURL(selectedSourcePreview)
    },
    [selectedSourcePreview]
  )

  const activeJob = jobs.find((job) =>
    job.status === "LOCAL_BUILDING" || job.status === "LOCAL_VALIDATING" || job.status === "LOCAL_UPLOADING"
  )
  const localQueueCount = jobs.filter((job) => job.status === "LOCAL_CLAIMED").length
  const automaty = agents[0] || null
  const automatyOnline = automaty ? isAgentOnline(automaty) : false
  const pendingApproval = jobs.filter((job) => job.status === "PENDING_APPROVAL")
  const queuedCount = jobs.filter((job) => job.status === "QUEUED_LOCAL").length
  const availableDraftsByProduct = useMemo(() => {
    const result = new Map<ProductType, number>()
    for (const item of draftSummary) {
      if (item.status === "AVAILABLE") result.set(item.productType, item.count)
    }
    return result
  }, [draftSummary])

  async function submitSource() {
    if (!sourceFile || !sourcePrompt.trim()) {
      setMessageTone("error")
      setMessage("Select the design and include the prompt that created it.")
      return
    }

    setSubmitting(true)
    setMessage(null)
    try {
      const formData = new FormData()
      formData.set("productType", productType)
      formData.set("sourcePrompt", sourcePrompt.trim())
      formData.set("sourceFile", sourceFile)
      const response = await fetch("/api/automation/jobs", { method: "POST", body: formData })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to add the design.")

      setMessageTone("success")
      setMessage(`${data.job.productCode} was added to the production queue.`)
      setSourceFile(null)
      setSourcePrompt("")
      await loadDashboard(true)
    } catch (error) {
      setMessageTone("error")
      setMessage(error instanceof Error ? error.message : "Unable to add the design.")
    } finally {
      setSubmitting(false)
    }
  }

  async function updatePipeline(action: "resume" | "pause") {
    setPipelineUpdating(true)
    setMessage(null)
    try {
      const response = await fetch("/api/automation/pipeline", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to update production mode.")
      setPipelineMode(data.mode)
      setMessageTone("success")
      setMessage(
        data.mode === "RUNNING"
          ? "Production is active: Automaty syncs approved designs and works through its queue whenever it is on."
          : "Production paused: Automaty finishes the listing in progress and does not start another."
      )
    } catch (error) {
      setMessageTone("error")
      setMessage(error instanceof Error ? error.message : "Unable to update production mode.")
    } finally {
      setPipelineUpdating(false)
    }
  }

  async function submitDrafts() {
    if (!draftIds.trim()) return
    setDraftSubmitting(true)
    setMessage(null)
    try {
      const response = await fetch("/api/automation/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productType: draftProductType, draftIds }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to add Etsy drafts.")
      setDraftIds("")
      setMessageTone("success")
      setMessage(
        `${data.added} Etsy draft${data.added === 1 ? "" : "s"} added` +
          (data.duplicates ? `; ${data.duplicates} already existed.` : ".")
      )
      await loadDashboard(true)
    } catch (error) {
      setMessageTone("error")
      setMessage(error instanceof Error ? error.message : "Unable to add Etsy drafts.")
    } finally {
      setDraftSubmitting(false)
    }
  }

  async function removeDraft(draftId: string) {
    try {
      const response = await fetch("/api/automation/drafts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to remove the draft.")
      await loadDashboard(true)
    } catch (error) {
      setMessageTone("error")
      setMessage(error instanceof Error ? error.message : "Unable to remove the draft.")
    }
  }

  async function retryJob(jobId: string) {
    setRetryingJobId(jobId)
    setMessage(null)
    try {
      const response = await fetch(`/api/automation/jobs/${jobId}/retry`, { method: "PATCH" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to retry the job.")
      setMessageTone("success")
      setMessage(`${data.job.productCode} will continue from its last safe step.`)
      await loadDashboard(true)
    } catch (error) {
      setMessageTone("error")
      setMessage(error instanceof Error ? error.message : "Unable to retry the job.")
    } finally {
      setRetryingJobId(null)
    }
  }

  async function manageJob(jobId: string, payload: { action: "cancel" } | { action: "priority"; priority: number }) {
    if (payload.action === "cancel" && !window.confirm("Cancel this design? It will be removed from the queue.")) return
    setManagingJobId(jobId)
    setMessage(null)
    try {
      const response = await fetch(`/api/automation/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to update the design.")
      setMessageTone("success")
      setMessage(
        payload.action === "cancel"
          ? `${data.job.productCode} canceled.`
          : `${data.job.productCode} priority updated.`
      )
      await loadDashboard(true)
    } catch (error) {
      setMessageTone("error")
      setMessage(error instanceof Error ? error.message : "Unable to update the design.")
    } finally {
      setManagingJobId(null)
    }
  }

  async function reviewDesign(jobId: string, decision: "approve" | "reject") {
    setReviewingJobId(jobId)
    setMessage(null)
    try {
      const response = await fetch(`/api/automation/jobs/${jobId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: reviewNotes[jobId] || null }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to review the design.")
      setMessageTone("success")
      setMessage(
        decision === "approve"
          ? `${data.job.productCode} approved and added to the production queue.`
          : `${data.job.productCode} rejected.`
      )
      setReviewNotes((current) => {
        const next = { ...current }
        delete next[jobId]
        return next
      })
      await loadDashboard(true)
    } catch (error) {
      setMessageTone("error")
      setMessage(error instanceof Error ? error.message : "Unable to review the design.")
    } finally {
      setReviewingJobId(null)
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 border-b border-neutral-800 pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase text-[#f1cc61]">Production controller</div>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-100">Automation</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            Approve designs, follow Automaty and control production from any device.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="border border-neutral-800 bg-neutral-950 px-4 py-3">
            <div className="text-[11px] uppercase text-neutral-500">Production</div>
            <div className="mt-1 text-sm font-semibold text-neutral-100">
              {pipelineMode === "PAUSED" ? "Paused" : "Active"}
            </div>
          </div>
          <div className="border border-neutral-800 bg-neutral-950 px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] uppercase text-neutral-500">
              <span className={`h-2 w-2 rounded-full ${automatyOnline ? "bg-emerald-400" : "bg-neutral-600"}`} />
              Automaty
            </div>
            <div className="mt-1 text-sm font-semibold text-neutral-100">
              {!automaty
                ? "Not connected yet"
                : automatyOnline
                  ? activeJob ? `Producing ${activeJob.productCode}` : "Online · idle"
                  : `Offline${automaty.lastSeenAt ? ` · last seen ${formatDate(automaty.lastSeenAt)}` : ""}`}
            </div>
          </div>
          <button
            type="button"
            title="Refresh production status"
            onClick={() => void loadDashboard()}
            disabled={refreshing}
            className="flex h-11 w-11 items-center justify-center border border-neutral-800 bg-neutral-950 text-neutral-300 transition hover:border-[#eeba2b]/35 hover:text-[#f1cc61] disabled:opacity-50"
          >
            <RefreshCw size={17} className={refreshing ? "animate-spin" : ""} />
          </button>
          {pipelineMode === "PAUSED" ? (
            <button
              type="button"
              onClick={() => void updatePipeline("resume")}
              disabled={pipelineUpdating}
              className="inline-flex h-11 items-center gap-2 bg-[#eeba2b] px-5 text-sm font-semibold text-neutral-950 transition hover:bg-[#f1cc61] disabled:opacity-50"
            >
              {pipelineUpdating ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Resume production
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void updatePipeline("pause")}
              disabled={pipelineUpdating}
              className="inline-flex h-11 items-center gap-2 border border-amber-400/30 bg-amber-400/10 px-5 text-sm font-semibold text-amber-100 transition hover:bg-amber-400/15 disabled:opacity-50"
            >
              {pipelineUpdating ? <Loader2 size={16} className="animate-spin" /> : <Pause size={16} />}
              Pause production
            </button>
          )}
        </div>
      </header>

      {message ? (
        <div className={`flex items-start gap-3 border px-4 py-3 text-sm ${
          messageTone === "error"
            ? "border-red-500/30 bg-red-500/10 text-red-200"
            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
        }`}>
          {messageTone === "error" ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{message}</span>
        </div>
      ) : null}

      {pendingApproval.length > 0 ? (
        <section className="border-b border-neutral-800 pb-8">
          <div className="flex items-center gap-3">
            <Clock3 size={18} className="text-[#f1cc61]" />
            <h2 className="text-lg font-semibold">Designs waiting for approval</h2>
            <span className="text-sm text-neutral-500">{pendingApproval.length}</span>
          </div>
          <p className="mt-2 text-sm text-neutral-400">
            Submitted by Claude. Approved designs join the production queue; rejected ones are canceled and the note is kept as feedback.
          </p>
          <div className="mt-5 grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
            {pendingApproval.map((job) => {
              const brief = parseBrief(job)
              const busy = reviewingJobId === job.id
              return (
                <article key={job.id} className="border border-neutral-800 bg-neutral-950">
                  <button
                    type="button"
                    title="Open full resolution"
                    onClick={() => setLightbox({
                      src: job.sourcePreviewUrl,
                      alt: `Design ${job.productCode}`,
                      caption: `${job.productCode} · ${productLabel(job.productType)}`,
                    })}
                    className="block w-full cursor-zoom-in"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${job.sourcePreviewUrl}?w=900`}
                      alt={`Design ${job.productCode}`}
                      loading="lazy"
                      className="aspect-square w-full bg-neutral-900 object-contain"
                    />
                  </button>
                  <div className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-semibold text-neutral-200">{job.productCode}</span>
                      <span className="text-neutral-500">{productLabel(job.productType)}</span>
                    </div>
                    {brief?.collection ? (
                      <div className="text-xs text-[#f1cc61]">Collection: {brief.collection}</div>
                    ) : null}
                    {brief?.primaryKeyword ? (
                      <div className="text-xs text-neutral-300">
                        <span className="font-semibold">{brief.primaryKeyword.keyword}</span>
                        {brief.primaryKeyword.etsyMonthlySearches != null
                          ? ` · ${brief.primaryKeyword.etsyMonthlySearches.toLocaleString("en-US")} searches/mo`
                          : ""}
                        {brief.primaryKeyword.competingListings != null
                          ? ` · ${brief.primaryKeyword.competingListings.toLocaleString("en-US")} listings`
                          : ""}
                        {brief.secondaryKeywords?.length ? (
                          <div className="mt-1 text-neutral-500">
                            {brief.secondaryKeywords.map((item) => item.keyword).join(", ")}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {brief?.rationale ? <p className="text-xs leading-5 text-neutral-400">{brief.rationale}</p> : null}
                    <details className="text-xs text-neutral-500">
                      <summary className="cursor-pointer">Prompt</summary>
                      <p className="mt-2 whitespace-pre-wrap leading-5">{job.sourcePrompt}</p>
                    </details>
                    <input
                      type="text"
                      value={reviewNotes[job.id] || ""}
                      onChange={(event) => setReviewNotes((current) => ({ ...current, [job.id]: event.target.value }))}
                      placeholder="Note (optional, helps Claude learn)"
                      maxLength={1000}
                      className="h-10 w-full border border-neutral-800 bg-neutral-900 px-3 text-sm text-neutral-200 outline-none focus:border-[#eeba2b]/50"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void reviewDesign(job.id, "approve")}
                        className="inline-flex h-10 flex-1 items-center justify-center gap-2 bg-[#eeba2b] text-sm font-semibold text-neutral-950 transition hover:bg-[#f1cc61] disabled:opacity-50"
                      >
                        {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void reviewDesign(job.id, "reject")}
                        className="inline-flex h-10 flex-1 items-center justify-center gap-2 border border-red-500/30 bg-red-500/10 text-sm font-semibold text-red-200 transition hover:bg-red-500/15 disabled:opacity-50"
                      >
                        <Trash2 size={15} />
                        Reject
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      <section className="grid gap-8 border-b border-neutral-800 pb-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div>
          <div className="flex items-center gap-3">
            <Upload size={18} className="text-[#f1cc61]" />
            <h2 className="text-lg font-semibold">Add a design</h2>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-[220px_minmax(0,1fr)]">
            <label className="group flex aspect-square cursor-pointer items-center justify-center overflow-hidden border border-dashed border-neutral-700 bg-neutral-950 transition hover:border-[#eeba2b]/45">
              {selectedSourcePreview ? (
                // Browser rendering is required for authenticated/blob image URLs.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selectedSourcePreview} alt="Selected source design" className="h-full w-full object-contain" />
              ) : (
                <div className="px-5 text-center">
                  <FileImage size={30} className="mx-auto text-neutral-500 group-hover:text-[#f1cc61]" />
                  <div className="mt-3 text-sm font-medium text-neutral-300">Select final design</div>
                  <div className="mt-1 text-xs text-neutral-500">PNG, JPG or WebP</div>
                </div>
              )}
              <input
                type="file"
                accept={productType === "png_designs" ? "image/png" : "image/png,image/jpeg,image/webp"}
                className="hidden"
                onChange={(event) => setSourceFile(event.target.files?.[0] || null)}
              />
            </label>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase text-neutral-500">Product</span>
                <select
                  value={productType}
                  onChange={(event) => {
                    setProductType(event.target.value as ProductType)
                    setSourceFile(null)
                  }}
                  className="h-11 w-full border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none focus:border-[#eeba2b]/45"
                >
                  {PRODUCT_OPTIONS.map((product) => (
                    <option key={product.value} value={product.value}>{product.label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase text-neutral-500">Creation prompt</span>
                <textarea
                  value={sourcePrompt}
                  onChange={(event) => setSourcePrompt(event.target.value)}
                  rows={7}
                  placeholder="Paste the exact prompt that created this design..."
                  className="w-full resize-y border border-neutral-800 bg-neutral-950 px-3 py-3 text-sm leading-6 text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-[#eeba2b]/45"
                />
              </label>
              <button
                type="button"
                onClick={() => void submitSource()}
                disabled={submitting || !sourceFile || !sourcePrompt.trim()}
                className="inline-flex h-11 w-full items-center justify-center gap-2 bg-[#eeba2b] px-5 text-sm font-semibold text-neutral-950 transition hover:bg-[#f1cc61] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {submitting ? "Securing source..." : "Add to production queue"}
              </button>
            </div>
          </div>
        </div>

        <div className="border-l-0 border-neutral-800 xl:border-l xl:pl-8">
          <div className="flex items-center gap-3">
            <Database size={18} className="text-[#f1cc61]" />
            <h2 className="text-lg font-semibold">Etsy draft inventory</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-neutral-400">
            Add the duplicated draft IDs for one product. An ID can belong to only one product pool.
          </p>
          <div className="mt-5 space-y-4">
            <select
              value={draftProductType}
              onChange={(event) => setDraftProductType(event.target.value as ProductType)}
              className="h-11 w-full border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none focus:border-[#eeba2b]/45"
            >
              {PRODUCT_OPTIONS.map((product) => (
                <option key={product.value} value={product.value}>{product.label}</option>
              ))}
            </select>
            <textarea
              value={draftIds}
              onChange={(event) => setDraftIds(event.target.value)}
              rows={5}
              placeholder="One Etsy draft ID per line, or separate them with commas..."
              className="w-full resize-y border border-neutral-800 bg-neutral-950 px-3 py-3 text-sm leading-6 text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-[#eeba2b]/45"
            />
            <button
              type="button"
              onClick={() => void submitDrafts()}
              disabled={draftSubmitting || !draftIds.trim()}
              className="inline-flex h-11 w-full items-center justify-center gap-2 border border-[#eeba2b]/35 bg-[#eeba2b]/10 px-5 text-sm font-semibold text-[#f1cc61] transition hover:bg-[#eeba2b]/15 disabled:opacity-40"
            >
              {draftSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
              Add draft IDs
            </button>
          </div>

          <div className="mt-6 divide-y divide-neutral-800 border-y border-neutral-800">
            {PRODUCT_OPTIONS.map((product) => (
              <div key={product.value} className="flex items-center justify-between gap-4 py-3 text-sm">
                <span className="text-neutral-400">{product.label}</span>
                <span className="font-semibold text-neutral-100">
                  {availableDraftsByProduct.get(product.value) || 0} available
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Production queue</h2>
            <p className="mt-1 text-sm text-neutral-500">
              {queuedCount} approved waiting for sync · {localQueueCount} in Automaty&apos;s queue
              {activeJob ? ` · producing ${activeJob.productCode}` : ""}
            </p>
          </div>
          {loading ? <Loader2 size={18} className="animate-spin text-neutral-500" /> : null}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {jobs.length ? jobs.map((job) => {
            const source = job.files.find((file) => file.slotKey === "source:primary")
            const needsAttention = job.status === "NEEDS_ATTENTION" || job.status === "RETRY_WAIT"
            return (
              <article key={job.id} className="grid min-h-[180px] grid-cols-[140px_minmax(0,1fr)] overflow-hidden border border-neutral-800 bg-neutral-950">
                <div className="flex h-full min-h-[180px] items-center justify-center border-r border-neutral-800 bg-neutral-900">
                  {source && source.status !== "DELETED" ? (
                    <button
                      type="button"
                      title="Open full resolution"
                      onClick={() => setLightbox({
                        src: job.sourcePreviewUrl,
                        alt: job.productCode,
                        caption: `${job.productCode} · ${productLabel(job.productType)}`,
                      })}
                      className="h-full w-full cursor-zoom-in"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`${job.sourcePreviewUrl}?w=480`} alt={job.productCode} loading="lazy" className="h-full w-full object-contain" />
                    </button>
                  ) : (
                    <CheckCircle2 size={28} className="text-emerald-400" />
                  )}
                </div>
                <div className="flex min-w-0 flex-col p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-neutral-100">{job.productCode}</div>
                      <div className="mt-1 text-xs text-neutral-500">{productLabel(job.productType)}</div>
                    </div>
                    {needsAttention ? (
                      <AlertCircle size={18} className="shrink-0 text-red-300" />
                    ) : isFinished(job.status) ? (
                      <CheckCircle2 size={18} className="shrink-0 text-emerald-300" />
                    ) : (
                      <Clock3 size={18} className="shrink-0 text-[#f1cc61]" />
                    )}
                  </div>
                  <div className={`mt-4 text-sm font-medium ${needsAttention ? "text-red-200" : "text-neutral-200"}`}>
                    {STATUS_LABELS[job.status] || job.status}
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-neutral-500">{job.sourcePrompt}</p>
                  {needsAttention && job.lastError ? (
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-red-300/80">{job.lastError}</p>
                  ) : null}
                  {needsAttention ? (
                    <button
                      type="button"
                      onClick={() => void retryJob(job.id)}
                      disabled={retryingJobId === job.id}
                      className="mt-3 inline-flex h-9 w-fit items-center gap-2 border border-red-400/25 bg-red-400/10 px-3 text-xs font-semibold text-red-100 transition hover:bg-red-400/15 disabled:opacity-50"
                    >
                      {retryingJobId === job.id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <RotateCcw size={14} />}
                      Retry from last safe step
                    </button>
                  ) : null}
                  {needsAttention ? (
                    <button
                      type="button"
                      disabled={managingJobId === job.id}
                      onClick={() => void manageJob(job.id, { action: "cancel" })}
                      className="mt-2 inline-flex h-9 w-fit items-center border border-red-500/30 px-3 text-xs font-semibold text-red-200 transition hover:bg-red-500/10 disabled:opacity-50"
                    >
                      Cancel design
                    </button>
                  ) : null}
                  {job.status === "QUEUED_LOCAL" || job.status === "LOCAL_CLAIMED" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={managingJobId === job.id}
                        onClick={() => void manageJob(job.id, { action: "priority", priority: job.priority > 0 ? 0 : 10 })}
                        className="inline-flex h-9 items-center border border-neutral-700 px-3 text-xs font-semibold text-neutral-200 transition hover:border-[#eeba2b]/40 disabled:opacity-50"
                      >
                        {job.priority > 0 ? "Remove priority" : "Prioritize"}
                      </button>
                      <button
                        type="button"
                        disabled={managingJobId === job.id}
                        onClick={() => void manageJob(job.id, { action: "cancel" })}
                        className="inline-flex h-9 items-center border border-red-500/30 px-3 text-xs font-semibold text-red-200 transition hover:bg-red-500/10 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}
                  <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-4 text-[11px] text-neutral-600">
                    <span>{formatDate(job.createdAt)}</span>
                    <span>{formatBytes(source?.byteSize || null)}</span>
                  </div>
                </div>
              </article>
            )
          }) : (
            <div className="col-span-full border border-dashed border-neutral-800 py-14 text-center text-sm text-neutral-500">
              No designs have entered the production queue yet.
            </div>
          )}
        </div>
      </section>

      {drafts.some((draft) => draft.status === "AVAILABLE") ? (
        <section className="border-t border-neutral-800 pt-7">
          <h2 className="text-base font-semibold">Available draft IDs</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {drafts.filter((draft) => draft.status === "AVAILABLE").map((draft) => (
              <div key={draft.draftId} className="inline-flex h-9 items-center gap-2 border border-neutral-800 bg-neutral-950 pl-3 text-xs text-neutral-300">
                <span>{draft.draftId}</span>
                <span className="text-neutral-600">{productLabel(draft.productType)}</span>
                <button
                  type="button"
                  title={`Remove draft ${draft.draftId}`}
                  onClick={() => void removeDraft(draft.draftId)}
                  className="flex h-full w-9 items-center justify-center border-l border-neutral-800 text-neutral-500 transition hover:bg-red-500/10 hover:text-red-300"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {lightbox ? (
        <ImageLightbox src={lightbox.src} alt={lightbox.alt} caption={lightbox.caption} onClose={() => setLightbox(null)} />
      ) : null}
    </div>
  )
}
