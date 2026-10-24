import type { ProductType } from "@/lib/products"

export const AUTOMATION_JOB_STATUSES = [
  "CREATED",
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
  "COMPLETED",
  "RETRY_WAIT",
  "NEEDS_ATTENTION",
  "CANCELED",
] as const

export type AutomationJobStatus = (typeof AUTOMATION_JOB_STATUSES)[number]

export const AUTOMATION_STEP_STATUSES = [
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "SKIPPED",
] as const

export type AutomationStepStatus = (typeof AUTOMATION_STEP_STATUSES)[number]

export const AUTOMATION_FILE_STATUSES = [
  "PENDING",
  "UPLOADING",
  "UPLOADED",
  "VERIFIED",
  "FAILED",
  "DELETED",
] as const

export type AutomationFileStatus = (typeof AUTOMATION_FILE_STATUSES)[number]

export const AUTOMATION_PIPELINE_MODES = [
  "RUNNING",
  "STOPPING_AFTER_CURRENT",
  "PAUSED",
] as const

export type AutomationPipelineMode = (typeof AUTOMATION_PIPELINE_MODES)[number]

export type AutomationJob = {
  id: string
  productCode: string
  productType: ProductType
  sourcePrompt: string
  status: AutomationJobStatus
  resumeStatus: AutomationJobStatus | null
  localAgentId: string | null
  leaseExpiresAt: string | null
  etsyDraftId: string | null
  etsyState: string | null
  etsyUrl: string | null
  seoJson: string | null
  pinterestSeoJson: string | null
  lastError: string | null
  nextAttemptAt: string | null
  retryCount: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export type CreateAutomationJobInput = {
  productType: ProductType
  sourcePrompt: string
  productCode?: string
}

export type AutomationJobFile = {
  id: string
  jobId: string
  slotKey: string
  role: string
  position: number | null
  relativePath: string
  r2Key: string | null
  contentType: string | null
  byteSize: number | null
  sha256: string | null
  status: AutomationFileStatus
  uploadedAt: string | null
  verifiedAt: string | null
  deletedAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export type AutomationJobEvent = {
  id: number
  jobId: string
  eventType: string
  fromStatus: AutomationJobStatus | null
  toStatus: AutomationJobStatus | null
  message: string | null
  metadataJson: string | null
  createdAt: string
}

export type EtsyDraftPoolStatus = "AVAILABLE" | "ASSIGNED" | "INVALID"

export type EtsyDraftPoolItem = {
  draftId: string
  productType: ProductType
  taxonomyId: number | null
  status: EtsyDraftPoolStatus
  assignedJobId: string | null
  assignedAt: string | null
  createdAt: string
  updatedAt: string
}

export type AutomationAgentStatus = "ONLINE" | "BUSY" | "OFFLINE"

export type AutomationAgent = {
  id: string
  name: string
  status: AutomationAgentStatus
  capabilitiesJson: string | null
  currentJobId: string | null
  lastSeenAt: string | null
  createdAt: string
  updatedAt: string
}
