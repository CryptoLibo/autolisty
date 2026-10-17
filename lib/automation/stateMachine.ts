import type { AutomationJobStatus } from "./types"

const NORMAL_TRANSITIONS: Record<AutomationJobStatus, readonly AutomationJobStatus[]> = {
  CREATED: ["SOURCE_READY", "CANCELED"],
  SOURCE_READY: ["QUEUED_LOCAL", "CANCELED"],
  QUEUED_LOCAL: ["LOCAL_CLAIMED", "CANCELED"],
  LOCAL_CLAIMED: ["LOCAL_BUILDING", "QUEUED_LOCAL", "CANCELED"],
  LOCAL_BUILDING: ["LOCAL_VALIDATING", "CANCELED"],
  LOCAL_VALIDATING: ["LOCAL_UPLOADING", "CANCELED"],
  LOCAL_UPLOADING: ["LOCAL_COMPLETE", "CANCELED"],
  LOCAL_COMPLETE: ["DRAFT_ASSIGNED", "CANCELED"],
  DRAFT_ASSIGNED: ["SEO_GENERATING", "CANCELED"],
  SEO_GENERATING: ["SEO_READY", "CANCELED"],
  SEO_READY: ["PINTEREST_SEO_GENERATING", "DELIVERY_PREPARING", "CANCELED"],
  PINTEREST_SEO_GENERATING: ["PINTEREST_SEO_READY", "CANCELED"],
  PINTEREST_SEO_READY: ["DELIVERY_PREPARING", "CANCELED"],
  DELIVERY_PREPARING: ["DELIVERY_READY", "CANCELED"],
  DELIVERY_READY: ["ETSY_TEXT_SYNCING", "CANCELED"],
  ETSY_TEXT_SYNCING: ["ETSY_MEDIA_SYNCING", "CANCELED"],
  ETSY_MEDIA_SYNCING: ["ETSY_FILE_SYNCING", "CANCELED"],
  ETSY_FILE_SYNCING: ["ETSY_VIDEO_SYNCING", "WAITING_ETSY_REVIEW", "CANCELED"],
  ETSY_VIDEO_SYNCING: ["WAITING_ETSY_REVIEW", "CANCELED"],
  WAITING_ETSY_REVIEW: ["ETSY_ACTIVE", "CANCELED"],
  ETSY_ACTIVE: ["PINTEREST_PUBLISHING", "COMPLETED", "CANCELED"],
  PINTEREST_PUBLISHING: ["COMPLETED", "CANCELED"],
  COMPLETED: [],
  RETRY_WAIT: [],
  NEEDS_ATTENTION: [],
  CANCELED: [],
}

const RECOVERABLE_STATUSES = new Set<AutomationJobStatus>([
  "SOURCE_READY",
  "QUEUED_LOCAL",
  "LOCAL_CLAIMED",
  "LOCAL_BUILDING",
  "LOCAL_VALIDATING",
  "LOCAL_UPLOADING",
  "LOCAL_COMPLETE",
  "DRAFT_ASSIGNED",
  "SEO_GENERATING",
  "SEO_READY",
  "PINTEREST_SEO_GENERATING",
  "PINTEREST_SEO_READY",
  "DELIVERY_PREPARING",
  "DELIVERY_READY",
  "ETSY_TEXT_SYNCING",
  "ETSY_MEDIA_SYNCING",
  "ETSY_FILE_SYNCING",
  "ETSY_VIDEO_SYNCING",
  "WAITING_ETSY_REVIEW",
  "ETSY_ACTIVE",
  "PINTEREST_PUBLISHING",
])

export function canTransitionAutomationJob(
  from: AutomationJobStatus,
  to: AutomationJobStatus,
  resumeStatus: AutomationJobStatus | null = null
) {
  if (from === to) return true

  if (to === "RETRY_WAIT" || to === "NEEDS_ATTENTION") {
    return RECOVERABLE_STATUSES.has(from)
  }

  if (from === "RETRY_WAIT" || from === "NEEDS_ATTENTION") {
    return Boolean(resumeStatus && to === resumeStatus && RECOVERABLE_STATUSES.has(to))
  }

  return NORMAL_TRANSITIONS[from].includes(to)
}

export function assertAutomationTransition(
  from: AutomationJobStatus,
  to: AutomationJobStatus,
  resumeStatus: AutomationJobStatus | null = null
) {
  if (!canTransitionAutomationJob(from, to, resumeStatus)) {
    throw new Error(`Invalid automation transition: ${from} -> ${to}`)
  }
}

export function isTerminalAutomationStatus(status: AutomationJobStatus) {
  return status === "COMPLETED" || status === "CANCELED"
}
