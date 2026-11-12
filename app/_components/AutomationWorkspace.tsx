"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import SeoLessonsPanel from "./SeoLessonsPanel"
import {
  Database,
  FileImage,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Settings2,
  Trash2,
  Upload,
} from "lucide-react"
import { PRODUCT_OPTIONS, type ProductType } from "@/lib/products"
import { ImageLightbox } from "./ImageLightbox"
import { PushNotificationsButton } from "./PushNotificationsButton"
import type {
  AutomationAgent,
  AutomationPipelineMode,
  EtsyDraftPoolItem,
} from "@/lib/automation/types"
import {
  STAGE_TABS,
  STATUS_LABELS,
  defaultStageTab,
  stageTabOf,
  timeAgo,
  type StageTab,
} from "@/lib/automation/stages"
import { JobCard, productLabel, type QueueJob } from "./automation/JobCard"
import { ApprovalCard, ApprovalFlow } from "./automation/Approval"
import { EmptyState, Toast, buttonPrimary, buttonSecondary, card, useConfirm } from "./automation/ui"

type DraftSummaryItem = {
  productType: ProductType
  status: EtsyDraftPoolItem["status"]
  count: number
}

const AGENT_ONLINE_WINDOW_MS = 3 * 60 * 1000
const LOW_DRAFT_STOCK = 5

function isAgentOnline(agent: AutomationAgent) {
  return Boolean(agent.lastSeenAt && Date.now() - new Date(agent.lastSeenAt).getTime() < AGENT_ONLINE_WINDOW_MS)
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
  const [regeneratingPdfs, setRegeneratingPdfs] = useState(false)

  async function regenerateDeliveryPdfs() {
    if (!(await confirm({
      title: "¿Regenerar los PDF de entrega?",
      body: "Se regenera el PDF de todos los listings creados por Automation con enlaces firmados y se sustituye en Etsy.",
      confirmLabel: "Regenerar",
    }))) return
    setRegeneratingPdfs(true)
    try {
      const response = await fetch("/api/automation/delivery-pdfs", { method: "POST" })
      const data = await response.json() as { results?: Array<{ productCode: string; ok: boolean; error?: string }>; error?: string }
      if (!response.ok) throw new Error(data.error || "No se pudieron regenerar los PDF.")
      const results = data.results || []
      const failed = results.filter((result) => !result.ok)
      setMessage(failed.length
        ? `PDF regenerados: ${results.length - failed.length}. Fallaron: ${failed.map((result) => `${result.productCode} (${result.error})`).join("; ")}`
        : `PDF regenerados con enlaces firmados: ${results.length}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudieron regenerar los PDF.")
    } finally {
      setRegeneratingPdfs(false)
    }
  }
  const [messageTone, setMessageTone] = useState<"success" | "error">("success")

  const [productType, setProductType] = useState<ProductType>("png_designs")
  const [sourcePrompt, setSourcePrompt] = useState("")
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [draftProductType, setDraftProductType] = useState<ProductType>("png_designs")
  const [draftIds, setDraftIds] = useState("")
  const [etsyDraftGroups, setEtsyDraftGroups] = useState<Array<{ title: string; imageUrl: string | null; listingIds: string[] }> | null>(null)
  const [etsyDraftLoading, setEtsyDraftLoading] = useState(false)
  const [groupProducts, setGroupProducts] = useState<Record<string, ProductType>>({})
  const [draftTemplates, setDraftTemplates] = useState<Record<string, string>>({})
  const [templateInputs, setTemplateInputs] = useState<Record<string, string>>({})
  const [templateSaving, setTemplateSaving] = useState<string | null>(null)
  const [ignoredDrafts, setIgnoredDrafts] = useState<string[]>([])

  useEffect(() => {
    fetch("/api/automation/drafts/templates", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        setDraftTemplates(data.templates || {})
        setTemplateInputs(data.templates || {})
        setIgnoredDrafts(data.ignored || [])
      })
      .catch(() => {})
  }, [])

  async function setDraftsIgnored(draftIds: string[], ignore: boolean, groupTitle?: string) {
    setTemplateSaving(groupTitle || draftIds.join(","))
    try {
      const response = await fetch("/api/automation/drafts/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftIds, ignore }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "No se pudo actualizar.")
      setIgnoredDrafts(data.ignored || [])
      if (ignore && groupTitle) {
        setEtsyDraftGroups((current) => current?.filter((group) => group.title !== groupTitle) ?? null)
      }
      setMessageTone("success")
      setMessage(ignore ? "Plantilla registrada: no volverá a salir al importar." : "El draft ya no se ignora.")
      await loadDashboard(true)
    } catch (error) {
      setMessageTone("error")
      setMessage(error instanceof Error ? error.message : "No se pudo actualizar.")
    } finally {
      setTemplateSaving(null)
    }
  }

  async function saveDraftTemplate(productType: ProductType) {
    setTemplateSaving(productType)
    try {
      const response = await fetch("/api/automation/drafts/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productType, draftId: (templateInputs[productType] || "").trim() }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "No se pudo guardar la plantilla.")
      setDraftTemplates(data.templates || {})
      setMessageTone("success")
      setMessage(`Plantilla de ${PRODUCT_OPTIONS.find((product) => product.value === productType)?.label} guardada. No se usará ni se importará nunca.`)
      await loadDashboard(true)
    } catch (error) {
      setMessageTone("error")
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la plantilla.")
    } finally {
      setTemplateSaving(null)
    }
  }
  const [draftSubmitting, setDraftSubmitting] = useState(false)
  const [pipelineUpdating, setPipelineUpdating] = useState(false)
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null)
  const [reviewingJobId, setReviewingJobId] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ src: string; alt: string; caption: string } | null>(null)
  const [tab, setTab] = useState<StageTab | null>(null)
  const [approvalFlowOpen, setApprovalFlowOpen] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkApproving, setBulkApproving] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { confirm, dialog: confirmDialog } = useConfirm()
  const clearMessage = useCallback(() => setMessage(null), [])

  function zoom(job: QueueJob) {
    // Primero una versión de 1400 px: el original puede pesar hasta 100 MB.
    setLightbox({ src: `${job.sourcePreviewUrl}?w=1400`, alt: job.productCode, caption: `${job.productCode} · ${productLabel(job.productType)}` })
  }

  const loadDashboard = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true)
    try {
      const [jobsResponse, draftsResponse] = await Promise.all([
        fetch("/api/automation/jobs", { cache: "no-store" }),
        fetch("/api/automation/drafts", { cache: "no-store" }),
      ])
      const jobsData = await jobsResponse.json()
      const draftsData = await draftsResponse.json()
      if (!jobsResponse.ok) throw new Error(jobsData.error || "No se pudo cargar la producción.")
      if (!draftsResponse.ok) throw new Error(draftsData.error || "No se pudo cargar el inventario de drafts.")

      setJobs(jobsData.jobs || [])
      setPipelineMode(jobsData.pipelineMode || "RUNNING")
      setAgents(jobsData.agents || [])
      setDrafts(draftsData.drafts || [])
      setDraftSummary(draftsData.summary || [])
    } catch (error) {
      setMessageTone("error")
      setMessage(error instanceof Error ? error.message : "No se pudo cargar Automation.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadDashboard(), 0)
    // Se refresca cada 15 s solo con la pantalla visible; al volver a ella, al momento.
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadDashboard(true)
    }, 15000)
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadDashboard(true)
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearTimeout(initialLoad)
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
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
      setMessage("Elige el diseño e incluye el prompt que lo creó.")
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
      if (!response.ok) throw new Error(data.error || "No se pudo añadir el diseño.")

      setMessageTone("success")
      setMessage(`${data.job.productCode} añadido a la cola.`)
      setSourceFile(null)
      setSourcePrompt("")
      await loadDashboard(true)
    } catch (error) {
      setMessageTone("error")
      setMessage(error instanceof Error ? error.message : "No se pudo añadir el diseño.")
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
      if (!response.ok) throw new Error(data.error || "No se pudo cambiar el modo de producción.")
      setPipelineMode(data.mode)
      setMessageTone("success")
      setMessage(
        data.mode === "RUNNING"
          ? "Producción activa: Automaty recoge los diseños aprobados y trabaja la cola cuando está encendido."
          : "Producción en pausa: Automaty termina el listing en curso y no empieza otro."
      )
    } catch (error) {
      setMessageTone("error")
      setMessage(error instanceof Error ? error.message : "No se pudo cambiar el modo de producción.")
    } finally {
      setPipelineUpdating(false)
    }
  }

  async function loadEtsyDrafts() {
    setEtsyDraftLoading(true)
    setMessage(null)
    try {
      const response = await fetch("/api/automation/drafts/etsy", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "No se pudieron leer los drafts de Etsy.")
      setEtsyDraftGroups(data.groups || [])
    } catch (error) {
      setMessageTone("error")
      setMessage(error instanceof Error ? error.message : "No se pudieron leer los drafts de Etsy.")
    } finally {
      setEtsyDraftLoading(false)
    }
  }

  async function importDraftGroup(group: { title: string; listingIds: string[] }) {
    const productType = groupProducts[group.title]
    if (!productType) return
    setDraftSubmitting(true)
    try {
      const response = await fetch("/api/automation/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productType, draftIds: group.listingIds }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "No se pudieron añadir los drafts.")
      setEtsyDraftGroups((groups) => (groups || []).filter((item) => item.title !== group.title))
      setMessageTone("success")
      setMessage(`${data.added} drafts añadidos a ${PRODUCT_OPTIONS.find((product) => product.value === productType)?.label}.`)
      await loadDashboard(true)
    } catch (error) {
      setMessageTone("error")
      setMessage(error instanceof Error ? error.message : "No se pudieron añadir los drafts.")
    } finally {
      setDraftSubmitting(false)
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
      if (!response.ok) throw new Error(data.error || "No se pudieron añadir los drafts.")
      setDraftIds("")
      setMessageTone("success")
      setMessage(
        `${data.added} drafts añadidos` +
          (data.duplicates ? `; ${data.duplicates} ya existían.` : ".")
      )
      await loadDashboard(true)
    } catch (error) {
      setMessageTone("error")
      setMessage(error instanceof Error ? error.message : "No se pudieron añadir los drafts.")
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
      if (!response.ok) throw new Error(data.error || "No se pudo quitar el draft.")
      await loadDashboard(true)
    } catch (error) {
      setMessageTone("error")
      setMessage(error instanceof Error ? error.message : "No se pudo quitar el draft.")
    }
  }

  async function retryJob(jobId: string) {
    setRetryingJobId(jobId)
    setMessage(null)
    try {
      const response = await fetch(`/api/automation/jobs/${jobId}/retry`, { method: "PATCH" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "No se pudo reintentar.")
      setMessageTone("success")
      setMessage(`${data.job.productCode} sigue desde el último paso seguro.`)
      await loadDashboard(true)
    } catch (error) {
      setMessageTone("error")
      setMessage(error instanceof Error ? error.message : "No se pudo reintentar.")
    } finally {
      setRetryingJobId(null)
    }
  }

  async function manageJob(
    jobId: string,
    payload:
      | { action: "cancel" | "discard" | "restart" }
      | { action: "priority"; priority: number }
  ) {
    const confirmations: Record<string, { title: string; body: string; confirmLabel: string; danger?: boolean }> = {
      cancel: { title: "¿Cancelar este diseño?", body: "Sale de la cola de producción.", confirmLabel: "Cancelar diseño", danger: true },
      discard: {
        title: "¿Descartar este diseño?",
        body: "Se cancela, su draft de Etsy vuelve al inventario y se borran de R2 todos los archivos con su código (mockups, pines, entregables, PDF). No se puede deshacer.",
        confirmLabel: "Descartar",
        danger: true,
      },
      restart: {
        title: "¿Empezar de nuevo?",
        body: "Se crea un diseño con un código NUEVO a partir de la misma imagen de Kittl y entra en la cola de Automaty. El actual se descarta: su draft vuelve al inventario y sus archivos se borran de R2.",
        confirmLabel: "Empezar de nuevo",
      },
    }
    const request = confirmations[payload.action]
    if (request && !(await confirm(request))) return
    setManagingJobId(jobId)
    setMessage(null)
    try {
      const response = await fetch(`/api/automation/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "No se pudo actualizar el diseño.")
      setMessageTone("success")
      setMessage(
        payload.action === "cancel"
          ? `${data.job.productCode} cancelado.`
          : payload.action === "discard"
            ? `${data.job.productCode} descartado y sus archivos borrados.`
            : payload.action === "restart"
              ? `${data.previous} descartado. Empieza de nuevo como ${data.job.productCode}, en la cola de Automaty.`
              : `Prioridad de ${data.job.productCode} actualizada.`
      )
      await loadDashboard(true)
    } catch (error) {
      setMessageTone("error")
      setMessage(error instanceof Error ? error.message : "No se pudo actualizar el diseño.")
    } finally {
      setManagingJobId(null)
    }
  }

  async function reviewDesign(job: QueueJob, decision: "approve" | "reject", note: string | null, quiet = false) {
    setReviewingJobId(job.id)
    if (!quiet) setMessage(null)
    try {
      const response = await fetch(`/api/automation/jobs/${job.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "No se pudo revisar el diseño.")
      if (!quiet) {
        setMessageTone("success")
        setMessage(decision === "approve" ? `${data.job.productCode} aprobado y en la cola.` : `${data.job.productCode} rechazado.`)
        await loadDashboard(true)
      }
      return true
    } catch (error) {
      setMessageTone("error")
      setMessage(error instanceof Error ? error.message : "No se pudo revisar el diseño.")
      return false
    } finally {
      setReviewingJobId(null)
    }
  }

  async function approveSelected() {
    const chosen = pendingApproval.filter((job) => selectedIds.includes(job.id))
    if (!chosen.length) return
    setBulkApproving(true)
    let approved = 0
    for (const job of chosen) {
      if (await reviewDesign(job, "approve", null, true)) approved += 1
    }
    setBulkApproving(false)
    setSelecting(false)
    setSelectedIds([])
    setMessageTone(approved === chosen.length ? "success" : "error")
    setMessage(`${approved} de ${chosen.length} diseños aprobados.`)
    await loadDashboard(true)
  }

  const jobsByTab = new Map<StageTab, QueueJob[]>()
  for (const job of jobs) {
    const key = stageTabOf(job.status)
    jobsByTab.set(key, [...(jobsByTab.get(key) || []), job])
  }
  const tabCounts = Object.fromEntries(STAGE_TABS.map(({ id }) => [id, jobsByTab.get(id)?.length || 0])) as Record<StageTab, number>
  const currentTab: StageTab = tab ?? defaultStageTab(tabCounts)
  const tabJobs = jobsByTab.get(currentTab) || []
  const issues = jobsByTab.get("issues") || []
  const inProduction = tabCounts.production
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const doneToday = jobs.filter((job) =>
    (job.status === "WAITING_ETSY_REVIEW" || stageTabOf(job.status) === "published") &&
    new Date(job.updatedAt).getTime() >= startOfToday.getTime()
  ).length
  const automatyStatus = !automaty
    ? "Sin conectar"
    : automatyOnline
      ? activeJob ? `Produciendo ${activeJob.productCode}` : "Encendido · sin trabajo"
      : "Apagado"

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-100">Automation</h1>
        <div className="flex flex-wrap items-center gap-2">
          <PushNotificationsButton />
          <button
            type="button"
            aria-label="Actualizar"
            title="Actualizar"
            onClick={() => void loadDashboard()}
            disabled={refreshing}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/12 text-neutral-200 transition hover:border-[#eeba2b]/40 hover:text-[#f1cc61] disabled:opacity-40"
          >
            <RefreshCw size={18} className={`shrink-0 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
          {pipelineMode === "PAUSED" ? (
            <button type="button" onClick={() => void updatePipeline("resume")} disabled={pipelineUpdating} className={buttonPrimary}>
              {pipelineUpdating ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} aria-hidden="true" />}
              Reanudar producción
            </button>
          ) : (
            <button type="button" onClick={() => void updatePipeline("pause")} disabled={pipelineUpdating} className={buttonSecondary}>
              {pipelineUpdating ? <Loader2 size={16} className="animate-spin" /> : <Pause size={16} aria-hidden="true" />}
              Pausar
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setSettingsOpen(true)
              window.setTimeout(() => document.getElementById("automation-settings")?.scrollIntoView({ behavior: "smooth" }), 50)
            }}
            className={buttonSecondary}
          >
            <Settings2 size={16} aria-hidden="true" />
            Ajustes
          </button>
        </div>
      </header>

      <section aria-label="Estado" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className={`col-span-2 p-4 lg:col-span-1 ${card}`}>
          <div className="flex items-center gap-2 text-[13px] text-neutral-400">
            <span className={`h-2 w-2 rounded-full ${automatyOnline ? "bg-emerald-400" : "bg-neutral-600"}`} aria-hidden="true" />
            Automaty
          </div>
          <div className="mt-2 text-[17px] font-semibold text-neutral-100">{automatyStatus}</div>
          <div className="mt-1 text-[13px] text-neutral-400">
            {activeJob
              ? `${STATUS_LABELS[activeJob.status]} · ${timeAgo(activeJob.updatedAt)}`
              : automaty?.lastSeenAt ? `Visto ${timeAgo(automaty.lastSeenAt)}` : "—"}
          </div>
        </div>
        <div className={`p-4 ${card}`}>
          <div className="text-[13px] text-neutral-400">Producción</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-100">
            {inProduction}
            <span className="ml-1.5 text-sm font-normal text-neutral-400">en curso</span>
          </div>
          <div className="mt-1 text-[13px] text-neutral-400">
            {pipelineMode === "PAUSED" ? "Pausada" : `${queuedCount + localQueueCount} en cola · ${doneToday} listos hoy`}
          </div>
        </div>
        <div className={`p-4 ${card}`}>
          <div className="text-[13px] text-neutral-400">Drafts disponibles</div>
          <div className="mt-2 space-y-1 text-[13px]">
            {PRODUCT_OPTIONS.map((product) => {
              const count = availableDraftsByProduct.get(product.value) || 0
              const low = count < LOW_DRAFT_STOCK
              return (
                <div key={product.value} className={`flex justify-between gap-2 ${low ? "text-orange-300" : "text-neutral-200"}`}>
                  <span className="truncate">{product.label}</span>
                  <span className="shrink-0">{count}{low ? " · reponer" : ""}</span>
                </div>
              )
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setTab("issues")}
          className={`p-4 text-left ${card} ${issues.length ? "border-orange-400/30" : ""}`}
        >
          <div className="text-[13px] text-neutral-400">Incidencias</div>
          <div className={`mt-2 text-2xl font-semibold ${issues.length ? "text-orange-300" : "text-neutral-100"}`}>{issues.length}</div>
          <div className="mt-1 truncate text-[13px] text-neutral-400">
            {issues.length ? issues.slice(0, 2).map((job) => job.productCode).join(" · ") : "Todo en orden"}
          </div>
        </button>
      </section>

      {pendingApproval.length > 0 ? (
        <button
          type="button"
          onClick={() => setApprovalFlowOpen(true)}
          className="flex h-14 w-full items-center justify-between rounded-xl bg-[#eeba2b] px-4 text-[15px] font-semibold text-neutral-950 md:hidden"
        >
          Aprobar {pendingApproval.length} {pendingApproval.length === 1 ? "diseño" : "diseños"}
          <span aria-hidden="true">›</span>
        </button>
      ) : null}

      <nav aria-label="Etapas" className="-mx-4 flex gap-1 overflow-x-auto border-b border-white/[0.07] px-4 sm:mx-0 sm:px-0">
        {STAGE_TABS.map(({ id, label }) => {
          const active = currentTab === id
          const count = tabCounts[id]
          const showCount = id !== "history" && id !== "published" && count > 0
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id)
                setSelecting(false)
                setSelectedIds([])
              }}
              aria-current={active ? "page" : undefined}
              className={`flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm transition ${
                active ? "border-[#eeba2b] font-medium text-neutral-100" : "border-transparent text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {label}
              {showCount ? (
                <span className={`rounded-full px-2 text-xs leading-5 ${
                  id === "approve" ? "bg-[#eeba2b] font-semibold text-neutral-950"
                    : id === "issues" ? "bg-orange-400/15 text-orange-300"
                    : "bg-white/10 text-neutral-300"
                }`}>
                  {count}
                </span>
              ) : null}
            </button>
          )
        })}
      </nav>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-neutral-500" aria-label="Cargando" /></div>
      ) : currentTab === "approve" ? (
        pendingApproval.length ? (
          <section aria-label="Diseños por aprobar" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-neutral-400">
                Enviados por Claude. Los aprobados entran en la cola; al rechazar, el motivo queda como aprendizaje.
              </p>
              <div className="flex gap-2">
                {selecting ? (
                  <>
                    <button type="button" onClick={() => { setSelecting(false); setSelectedIds([]) }} className={buttonSecondary}>Cancelar</button>
                    <button type="button" onClick={() => setSelectedIds(selectedIds.length === pendingApproval.length ? [] : pendingApproval.map((job) => job.id))} className={buttonSecondary}>
                      {selectedIds.length === pendingApproval.length ? "Ninguno" : "Todos"}
                    </button>
                    <button type="button" disabled={!selectedIds.length || bulkApproving} onClick={() => void approveSelected()} className={buttonPrimary}>
                      {bulkApproving ? <Loader2 size={15} className="animate-spin" /> : null}
                      Aprobar {selectedIds.length || ""}
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => setSelecting(true)} className={buttonSecondary}>Seleccionar varios</button>
                    <button type="button" onClick={() => setApprovalFlowOpen(true)} className={`${buttonPrimary} hidden md:inline-flex`}>Revisar uno a uno</button>
                  </>
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {pendingApproval.map((job) => (
                <ApprovalCard
                  key={job.id}
                  job={job}
                  busy={reviewingJobId === job.id || bulkApproving}
                  selecting={selecting}
                  selected={selectedIds.includes(job.id)}
                  onToggleSelect={() => setSelectedIds((ids) => ids.includes(job.id) ? ids.filter((id) => id !== job.id) : [...ids, job.id])}
                  onReview={(item, decision, note) => reviewDesign(item, decision, note)}
                  onZoom={zoom}
                />
              ))}
            </div>
          </section>
        ) : (
          <EmptyState
            title="Nada por aprobar"
            detail="Los diseños del día llegan hacia las 13:31."
            action={<button type="button" onClick={() => setTab("production")} className={buttonSecondary}>Ver producción</button>}
          />
        )
      ) : tabJobs.length ? (
        <section aria-label={STAGE_TABS.find((item) => item.id === currentTab)?.label} className="grid gap-3 lg:grid-cols-2">
          {tabJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              actions={{
                busy: managingJobId === job.id || retryingJobId === job.id,
                onZoom: zoom,
                onRetry: (item) => void retryJob(item.id),
                onRestart: (item) => void manageJob(item.id, { action: "restart" }),
                onDiscard: (item) => void manageJob(item.id, { action: "discard" }),
                onPriority: (item) => void manageJob(item.id, { action: "priority", priority: item.priority > 0 ? 0 : 10 }),
                onCancel: (item) => void manageJob(item.id, { action: "cancel" }),
              }}
            />
          ))}
        </section>
      ) : (
        <EmptyState
          title={{
            production: "Nada en producción",
            review: "Ningún draft esperando tu revisión",
            published: "Todavía no hay listings publicados",
            issues: "Sin incidencias",
            history: "Sin diseños cancelados",
            approve: "",
          }[currentTab]}
          detail={currentTab === "production" && pendingApproval.length ? `Tienes ${pendingApproval.length} por aprobar.` : undefined}
          action={currentTab === "production" && pendingApproval.length
            ? <button type="button" onClick={() => setTab("approve")} className={buttonSecondary}>Ir a aprobar</button>
            : undefined}
        />
      )}

      <section id="automation-settings" className="border-t border-white/[0.07] pt-6">
        <button
          type="button"
          onClick={() => setSettingsOpen((value) => !value)}
          aria-expanded={settingsOpen}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span>
            <span className="block text-base font-semibold text-neutral-100">Ajustes de Automation</span>
            <span className="mt-0.5 block text-sm text-neutral-400">Alta manual de diseños, inventario y plantillas de drafts, lecciones de SEO y PDF de entrega</span>
          </span>
          <span className="text-sm text-[#eeba2b]">{settingsOpen ? "Ocultar" : "Mostrar"}</span>
        </button>
        {settingsOpen ? (
          <div className="mt-6 space-y-8">
      <section className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div>
          <div className="flex items-center gap-3">
            <Upload size={18} className="text-[#f1cc61]" />
            <h2 className="text-lg font-semibold">Añadir un diseño a mano</h2>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-[220px_minmax(0,1fr)]">
            <label className="group flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/15 bg-[#0b0b0c] transition hover:border-[#eeba2b]/45">
              {selectedSourcePreview ? (
                // Browser rendering is required for authenticated/blob image URLs.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selectedSourcePreview} alt="Diseño elegido" className="h-full w-full object-contain" />
              ) : (
                <div className="px-5 text-center">
                  <FileImage size={30} className="mx-auto text-neutral-500 group-hover:text-[#f1cc61]" />
                  <div className="mt-3 text-sm font-medium text-neutral-300">Elegir el diseño final</div>
                  <div className="mt-1 text-xs text-neutral-500">PNG, JPG o WebP</div>
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
                <span className="mb-2 block text-xs font-semibold uppercase text-neutral-500">Producto</span>
                <select
                  value={productType}
                  onChange={(event) => {
                    setProductType(event.target.value as ProductType)
                    setSourceFile(null)
                  }}
                  className="h-11 w-full rounded-lg border border-white/10 bg-[#0b0b0c] px-3 text-sm text-neutral-100 outline-none focus:border-[#eeba2b]/45"
                >
                  {PRODUCT_OPTIONS.map((product) => (
                    <option key={product.value} value={product.value}>{product.label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase text-neutral-500">Prompt de creación</span>
                <textarea
                  value={sourcePrompt}
                  onChange={(event) => setSourcePrompt(event.target.value)}
                  rows={7}
                  placeholder="Pega el prompt exacto que creó el diseño…"
                  className="w-full resize-y rounded-lg border border-white/10 bg-[#0b0b0c] px-3 py-3 text-sm leading-6 text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-[#eeba2b]/45"
                />
              </label>
              <button
                type="button"
                onClick={() => void submitSource()}
                disabled={submitting || !sourceFile || !sourcePrompt.trim()}
                className="inline-flex h-11 w-full items-center justify-center gap-2 bg-[#eeba2b] px-5 text-sm font-semibold text-neutral-950 transition hover:bg-[#f1cc61] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {submitting ? "Guardando…" : "Añadir a la cola"}
              </button>
            </div>
          </div>
        </div>

        <div className="border-l-0 border-neutral-800 xl:border-l xl:pl-8">
          <div className="flex items-center gap-3">
            <Database size={18} className="text-[#f1cc61]" />
            <h2 className="text-lg font-semibold">Inventario de drafts de Etsy</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-neutral-400">
            Añade los IDs de los drafts duplicados de un producto. Cada ID pertenece a un solo producto.
          </p>
          <div className="mt-5 space-y-4">
            <select
              value={draftProductType}
              onChange={(event) => setDraftProductType(event.target.value as ProductType)}
              className="h-11 w-full rounded-lg border border-white/10 bg-[#0b0b0c] px-3 text-sm text-neutral-100 outline-none focus:border-[#eeba2b]/45"
            >
              {PRODUCT_OPTIONS.map((product) => (
                <option key={product.value} value={product.value}>{product.label}</option>
              ))}
            </select>
            <textarea
              value={draftIds}
              onChange={(event) => setDraftIds(event.target.value)}
              rows={5}
              placeholder="Un ID por línea, o separados por comas…"
              className="w-full resize-y rounded-lg border border-white/10 bg-[#0b0b0c] px-3 py-3 text-sm leading-6 text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-[#eeba2b]/45"
            />
            <button
              type="button"
              onClick={() => void submitDrafts()}
              disabled={draftSubmitting || !draftIds.trim()}
              className="inline-flex h-11 w-full items-center justify-center gap-2 border border-[#eeba2b]/35 bg-[#eeba2b]/10 px-5 text-sm font-semibold text-[#f1cc61] transition hover:bg-[#eeba2b]/15 disabled:opacity-40"
            >
              {draftSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
              Añadir IDs
            </button>
          </div>

          <div className="mt-4 rounded-lg border border-white/10 bg-[#0b0b0c]/60 p-3">
            <button
              type="button"
              onClick={() => void loadEtsyDrafts()}
              disabled={etsyDraftLoading}
              className="inline-flex h-10 w-full items-center justify-center gap-2 border border-neutral-700 px-4 text-sm text-neutral-200 transition hover:border-[#eeba2b]/40 hover:text-[#f1cc61] disabled:opacity-40"
            >
              {etsyDraftLoading ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />}
              Importar drafts desde Etsy
            </button>
            {etsyDraftGroups ? (
              etsyDraftGroups.length === 0 ? (
                <p className="mt-3 text-sm text-neutral-500">No hay drafts nuevos en Etsy.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {etsyDraftGroups.map((group) => (
                    <div key={group.title} className="space-y-3 border-t border-white/[0.07] pt-4">
                      <div className="flex items-start gap-3">
                        {group.imageUrl ? (
                          <button
                            type="button"
                            onClick={() => setLightbox({ src: group.imageUrl!, alt: group.title, caption: group.title })}
                            aria-label="Ampliar imagen del draft"
                            className="h-20 w-20 shrink-0 cursor-zoom-in overflow-hidden rounded-lg bg-white/[0.04]"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={group.imageUrl} alt="" className="h-full w-full object-cover" />
                          </button>
                        ) : (
                          <span aria-hidden="true" className="h-20 w-20 shrink-0 rounded-lg bg-white/[0.04]" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm leading-5 text-neutral-100">{group.title}</p>
                          <p className="mt-1 text-xs text-neutral-400">
                            {group.listingIds.length} {group.listingIds.length === 1 ? "draft" : "drafts"} ·{" "}
                            <a
                              href={`https://www.etsy.com/your/shops/me/listing-editor/edit/${group.listingIds[0]}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#eeba2b] hover:text-[#f7d875]"
                            >
                              Abrir en Etsy
                            </a>
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <label className="sr-only" htmlFor={`group-product-${group.listingIds[0]}`}>Producto</label>
                        <select
                          id={`group-product-${group.listingIds[0]}`}
                          value={groupProducts[group.title] || ""}
                          onChange={(event) => setGroupProducts((current) => ({ ...current, [group.title]: event.target.value as ProductType }))}
                          className="h-10 min-w-[160px] flex-1 rounded-lg border border-white/10 bg-[#0b0b0c] px-2 text-sm text-neutral-100"
                        >
                          <option value="">Elegir producto…</option>
                          {PRODUCT_OPTIONS.map((product) => (
                            <option key={product.value} value={product.value}>{product.label}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void importDraftGroup(group)}
                          disabled={draftSubmitting || !groupProducts[group.title]}
                          className={buttonPrimary}
                        >
                          Añadir
                        </button>
                        <button
                          type="button"
                          onClick={() => void setDraftsIgnored(group.listingIds, true, group.title)}
                          disabled={templateSaving === group.title}
                          title="Es una plantilla u otro producto: no volverá a salir al importar"
                          className={buttonSecondary}
                        >
                          Es plantilla
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : null}
          </div>

          <div className="mt-6 divide-y divide-neutral-800 border-y border-neutral-800">
            {PRODUCT_OPTIONS.map((product) => {
              const saved = draftTemplates[product.value] || ""
              const value = templateInputs[product.value] ?? ""
              return (
                <div key={product.value} className="py-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-neutral-300">{product.label}</span>
                    <span className="font-semibold text-neutral-100">
                      {availableDraftsByProduct.get(product.value) || 0} disponibles
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <label className="shrink-0 text-xs text-neutral-500" htmlFor={`template-${product.value}`}>
                      Plantilla base
                    </label>
                    <input
                      id={`template-${product.value}`}
                      inputMode="numeric"
                      value={value}
                      onChange={(event) => setTemplateInputs((current) => ({ ...current, [product.value]: event.target.value.replace(/\D/g, "") }))}
                      placeholder="ID del draft plantilla"
                      className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0b0b0c] px-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-[#eeba2b]/45"
                    />
                    <button
                      type="button"
                      onClick={() => void saveDraftTemplate(product.value)}
                      disabled={templateSaving === product.value || value === saved}
                      className="h-9 shrink-0 border border-neutral-700 px-3 text-xs text-neutral-200 transition hover:border-[#eeba2b]/40 hover:text-[#f1cc61] disabled:opacity-40"
                    >
                      {templateSaving === product.value ? "Guardando…" : saved && !value ? "Quitar" : "Guardar"}
                    </button>
                  </div>
                </div>
              )
            })}
            {ignoredDrafts.length > 0 ? (
              <div className="py-3 text-sm">
                <span className="text-neutral-300">Otras plantillas</span>
                <p className="mt-1 text-xs text-neutral-500">Nunca se importan ni se asignan (p. ej. phone cases).</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ignoredDrafts.map((draftId) => (
                    <span key={draftId} className="inline-flex h-8 items-center gap-2 border border-neutral-800 px-2 text-xs text-neutral-300">
                      {draftId}
                      <button
                        type="button"
                        onClick={() => void setDraftsIgnored([draftId], false)}
                        disabled={templateSaving === draftId}
                        className="text-neutral-500 hover:text-[#f1cc61] disabled:opacity-40"
                      >
                        Quitar
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

            <SeoLessonsPanel />
            <div className={`flex flex-wrap items-center justify-between gap-3 p-4 ${card}`}>
              <div>
                <div className="text-sm font-semibold text-neutral-100">PDF de entrega</div>
                <div className="mt-0.5 text-sm text-neutral-400">Regenera el PDF de los listings de Automation con enlaces firmados y lo sustituye en Etsy.</div>
              </div>
              <button type="button" onClick={() => void regenerateDeliveryPdfs()} disabled={regeneratingPdfs} className={buttonSecondary}>
                {regeneratingPdfs ? <Loader2 size={15} className="animate-spin" /> : null}
                {regeneratingPdfs ? "Regenerando…" : "Regenerar PDFs"}
              </button>
            </div>
      {drafts.some((draft) => draft.status === "AVAILABLE") ? (
        <section>
          <h2 className="text-base font-semibold">IDs de drafts disponibles</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {drafts.filter((draft) => draft.status === "AVAILABLE").map((draft) => (
              <div key={draft.draftId} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-[#0b0b0c] pl-3 text-xs text-neutral-300">
                <span>{draft.draftId}</span>
                <span className="text-neutral-600">{productLabel(draft.productType)}</span>
                <button
                  type="button"
                  aria-label={`Quitar draft ${draft.draftId}`}
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
          </div>
        ) : null}
      </section>

      {approvalFlowOpen ? (
        <ApprovalFlow
          jobs={pendingApproval}
          onReview={(job, decision, note) => reviewDesign(job, decision, note, true)}
          onZoom={zoom}
          onClose={() => {
            setApprovalFlowOpen(false)
            void loadDashboard(true)
          }}
        />
      ) : null}
      {confirmDialog}
      <Toast message={message} tone={messageTone} onClose={clearMessage} />
      {lightbox ? (
        <ImageLightbox src={lightbox.src} alt={lightbox.alt} caption={lightbox.caption} onClose={() => setLightbox(null)} />
      ) : null}
    </div>
  )
}
