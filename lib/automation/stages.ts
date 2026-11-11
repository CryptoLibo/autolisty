// Cómo se agrupan los estados de un diseño en la pantalla de Automation.
// Sin dependencias: lo usan la interfaz y los tests.
import type { AutomationJobStatus } from "./types"

export type StageTab = "approve" | "production" | "review" | "published" | "issues" | "history"

export const STAGE_TABS: Array<{ id: StageTab; label: string }> = [
  { id: "approve", label: "Por aprobar" },
  { id: "production", label: "En producción" },
  { id: "review", label: "Para revisar en Etsy" },
  { id: "published", label: "Publicados" },
  { id: "issues", label: "Incidencias" },
  { id: "history", label: "Historial" },
]

export function stageTabOf(status: AutomationJobStatus): StageTab {
  switch (status) {
    case "PENDING_APPROVAL":
      return "approve"
    case "WAITING_ETSY_REVIEW":
      return "review"
    case "ETSY_ACTIVE":
    case "PINTEREST_PUBLISHING":
    case "COMPLETED":
      return "published"
    case "NEEDS_ATTENTION":
    case "RETRY_WAIT":
      return "issues"
    case "CANCELED":
      return "history"
    default:
      return "production"
  }
}

/** La pestaña que se abre: la primera con algo que te toca a ti. */
export function defaultStageTab(counts: Partial<Record<StageTab, number>>): StageTab {
  for (const tab of ["approve", "issues", "review", "production"] as StageTab[]) {
    if ((counts[tab] || 0) > 0) return tab
  }
  return "published"
}

export const PIPELINE_STEPS = ["Aprobado", "Automaty", "SEO", "Draft en Etsy", "Tu revisión", "Publicado"] as const

/**
 * Paso actual (0–5) de la barra de etapas. Para una incidencia se usa el estado donde se paró.
 * Devuelve PIPELINE_STEPS.length cuando está todo hecho.
 */
export function pipelineStepOf(status: AutomationJobStatus, resumeStatus?: AutomationJobStatus | null): number {
  const effective = (status === "NEEDS_ATTENTION" || status === "RETRY_WAIT") && resumeStatus ? resumeStatus : status
  switch (effective) {
    case "CREATED":
    case "SOURCE_READY":
    case "PENDING_APPROVAL":
      return 0
    case "QUEUED_LOCAL":
    case "LOCAL_CLAIMED":
    case "LOCAL_BUILDING":
    case "LOCAL_VALIDATING":
    case "LOCAL_UPLOADING":
      return 1
    case "LOCAL_COMPLETE":
    case "DRAFT_ASSIGNED":
    case "SEO_GENERATING":
    case "SEO_READY":
    case "PINTEREST_SEO_GENERATING":
    case "PINTEREST_SEO_READY":
    case "DELIVERY_PREPARING":
    case "DELIVERY_READY":
      return 2
    case "ETSY_TEXT_SYNCING":
    case "ETSY_MEDIA_SYNCING":
    case "ETSY_FILE_SYNCING":
    case "ETSY_VIDEO_SYNCING":
      return 3
    case "WAITING_ETSY_REVIEW":
      return 4
    case "ETSY_ACTIVE":
    case "PINTEREST_PUBLISHING":
      return 5
    case "COMPLETED":
      return PIPELINE_STEPS.length
    default:
      return 0
  }
}

export const STATUS_LABELS: Record<AutomationJobStatus, string> = {
  CREATED: "Registrando el diseño",
  SOURCE_READY: "Diseño guardado",
  PENDING_APPROVAL: "Esperando tu aprobación",
  QUEUED_LOCAL: "Aprobado · esperando a Automaty",
  LOCAL_CLAIMED: "En la cola de Automaty",
  LOCAL_BUILDING: "Automaty · creando mockups",
  LOCAL_VALIDATING: "Automaty · validando la carpeta",
  LOCAL_UPLOADING: "Automaty · subiendo archivos",
  LOCAL_COMPLETE: "Automaty terminó",
  DRAFT_ASSIGNED: "Draft de Etsy asignado",
  SEO_GENERATING: "Generando el SEO de Etsy",
  SEO_READY: "SEO de Etsy listo",
  PINTEREST_SEO_GENERATING: "Generando el SEO de Pinterest",
  PINTEREST_SEO_READY: "SEO de Pinterest listo",
  DELIVERY_PREPARING: "Preparando el archivo de entrega",
  DELIVERY_READY: "Entrega lista",
  ETSY_TEXT_SYNCING: "Subiendo textos a Etsy",
  ETSY_MEDIA_SYNCING: "Subiendo imágenes a Etsy",
  ETSY_FILE_SYNCING: "Subiendo el archivo de entrega",
  ETSY_VIDEO_SYNCING: "Subiendo el vídeo a Etsy",
  WAITING_ETSY_REVIEW: "Draft listo para tu revisión",
  ETSY_ACTIVE: "Publicado en Etsy",
  PINTEREST_PUBLISHING: "Publicando pines",
  COMPLETED: "Terminado",
  RETRY_WAIT: "Reintento programado",
  NEEDS_ATTENTION: "Necesita tu atención",
  CANCELED: "Cancelado",
}

/** «hace 12 min», «hace 3 h», «hace 2 días». */
export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000))
  if (minutes < 1) return "ahora"
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.round(hours / 24)
  return `hace ${days} ${days === 1 ? "día" : "días"}`
}

export const REJECT_REASONS = ["Composición", "Colores", "Fuera de nicho", "Repetido", "Calidad baja"] as const
