// Postproducción en el servidor: lo que antes se hacía a mano en Scale.
//
// Cuando Automaty deja un listing en LOCAL_COMPLETE (todo verificado en R2), el
// worker lo lleva hasta el draft de Etsy listo para revisar:
//
//   LOCAL_COMPLETE → DRAFT_ASSIGNED → SEO_GENERATING → SEO_READY
//   → DELIVERY_PREPARING → DELIVERY_READY → ETSY_TEXT_SYNCING
//   → ETSY_MEDIA_SYNCING → ETSY_FILE_SYNCING → (ETSY_VIDEO_SYNCING)
//   → WAITING_ETSY_REVIEW → (publicado) → ETSY_ACTIVE
//   → PINTEREST_PUBLISHING → COMPLETED
//
// Cada estado "-ING" se puede repetir: si el servidor se reinicia o un paso
// falla, el trabajo vuelve a ese estado y el paso se ejecuta de nuevo entero.
// Los 3 pines se publican seguidos al detectar la publicación en Etsy, y se
// guarda cada id al momento: un reintento nunca duplica un pin ya publicado.
import type { EtsyTokenPayload } from "../etsy/auth"
import type { PinterestTokenPayload } from "../pinterest/auth"
import type { GeneratePinterestCopyInput, PinterestCopy } from "../seo/pinterestSeo"
import type { DraftSyncAttribute, DraftSyncMockup } from "../etsy/draftSync"
import type { EtsySeoResult, GenerateEtsySeoInput } from "../seo/etsySeo"
import { getProductOption, type ProductType } from "../products"
import type { DesignBrief } from "./designIntake"
import { getProductionProductContract } from "./productContracts"
import type { AutomationRepository } from "./repository"
import type { AutomationJob, AutomationJobFile, AutomationJobStatus } from "./types"

export type PostProductionDeps = {
  repository: AutomationRepository
  getEtsyToken: () => Promise<EtsyTokenPayload | null>
  getShopId: (token: EtsyTokenPayload) => Promise<number>
  generateSeo: (input: GenerateEtsySeoInput) => Promise<EtsySeoResult>
  buildDeliveryPdf: (productType: ProductType, productCode: string) => Promise<{ url: string }>
  syncText: (draft: DraftRef, input: { title: string; description: string; tags: string[]; attributes: DraftSyncAttribute[] }) => Promise<void>
  syncImages: (draft: DraftRef, mockups: DraftSyncMockup[]) => Promise<void>
  syncFile: (draft: DraftRef, input: { url: string; filename: string }) => Promise<void>
  syncVideo: (draft: DraftRef, input: { url: string; name: string }) => Promise<void>
  getListing: (token: EtsyTokenPayload, shopId: number, listingId: string) => Promise<{ state?: string; url?: string } | null>
  publicUrl: (r2Key: string) => string
  getPinterestToken: () => Promise<PinterestTokenPayload | null>
  generatePinCopy: (input: GeneratePinterestCopyInput) => Promise<{ pins: PinterestCopy[] }>
  findBoard: (token: PinterestTokenPayload, name: string) => Promise<{ id: string; name: string } | null>
  publishPin: (
    token: PinterestTokenPayload,
    input: { boardId: string; title: string; description: string; link: string; imageUrl: string }
  ) => Promise<{ pinId: string; boardId: string }>
  recordPin: (input: { pinId: string; boardId: string; title: string; destinationUrl: string; imageUrl: string }) => void
  now?: () => Date
}

type PinterestPlan = {
  boardId: string
  boardName: string
  pins: Array<{ id: string; imageUrl: string; title: string; description: string; pinId: string | null }>
}

type DraftRef = { token: EtsyTokenPayload; shopId: number; listingId: string }

/** Estados que el worker avanza (RETRY_WAIT solo si el reintento es de un paso de servidor). */
export const POST_PRODUCTION_STATUSES = [
  "LOCAL_COMPLETE",
  "DRAFT_ASSIGNED",
  "SEO_GENERATING",
  "SEO_READY",
  "DELIVERY_PREPARING",
  "DELIVERY_READY",
  "ETSY_TEXT_SYNCING",
  "ETSY_MEDIA_SYNCING",
  "ETSY_FILE_SYNCING",
  "ETSY_VIDEO_SYNCING",
  "WAITING_ETSY_REVIEW",
  "ETSY_ACTIVE",
  "PINTEREST_PUBLISHING",
] as const satisfies readonly AutomationJobStatus[]

const SERVER_STATUSES = new Set<AutomationJobStatus>(POST_PRODUCTION_STATUSES)

// Etsy: comprobar si ya publicaste el draft cada 30 minutos.
const ETSY_REVIEW_POLL_MS = 30 * 60_000
const MAX_AUTOMATIC_RETRIES = 3
const RETRY_DELAY_MS = 10 * 60_000

export class PostProductionError extends Error {
  constructor(message: string, readonly transient = false) {
    super(message)
  }
}

function isTransient(error: unknown) {
  if (error instanceof PostProductionError) return error.transient
  const message = error instanceof Error ? error.message : String(error)
  return /\b(429|500|502|503|504)\b|timeout|timed out|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up/i.test(message)
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2000)
}

// ---- Datos del trabajo ----

function verifiedFiles(repository: AutomationRepository, jobId: string) {
  return repository.listJobFiles(jobId).filter((file) => file.status === "VERIFIED" && file.r2Key)
}

function fileBySlot(files: AutomationJobFile[], slotKey: string) {
  return files.find((file) => file.slotKey === slotKey) || null
}

/** Fotos del listing en el orden de Etsy (la vista previa, 12.jpg, va segunda). */
export function listingImagesInEtsyOrder(job: AutomationJob, files: AutomationJobFile[], publicUrl: (key: string) => string) {
  const order = getProductionProductContract(job.productType).listing.etsyImageOrder
  const images: Array<{ id: string; position: number; url: string }> = []
  for (const slot of order) {
    const file = fileBySlot(files, `listing:${slot}`)
    if (!file?.r2Key) throw new PostProductionError(`Falta la imagen ${slot} del listing en R2.`)
    images.push({ id: `listing-${slot}`, position: images.length + 1, url: publicUrl(file.r2Key) })
  }
  return images
}

/** Keywords de la investigación (principal primero) para reforzar los textos. */
export function briefKeywords(briefJson: string | null) {
  if (!briefJson) return []
  try {
    const brief = JSON.parse(briefJson) as Partial<DesignBrief>
    return [brief.primaryKeyword, ...(brief.secondaryKeywords || [])]
      .map((item) => item?.keyword?.trim())
      .filter((keyword): keyword is string => Boolean(keyword))
  } catch {
    return []
  }
}

export function keywordResearchFromBrief(briefJson: string | null) {
  if (!briefJson) return null
  try {
    const brief = JSON.parse(briefJson) as Partial<DesignBrief>
    const lines: string[] = []
    const describe = (label: string, item: NonNullable<DesignBrief["primaryKeyword"]>) => {
      const metrics = [
        item.etsyMonthlySearches != null ? `${item.etsyMonthlySearches} searches/month` : null,
        item.competingListings != null ? `${item.competingListings} competing listings` : null,
        item.competition ? `competition ${item.competition}` : null,
        item.trend3m != null ? `3-month trend ${Math.round(item.trend3m * 100)}%` : null,
      ].filter(Boolean)
      lines.push(`${label}: "${item.keyword}"${metrics.length ? ` (${metrics.join(", ")})` : ""}`)
    }
    if (brief.primaryKeyword?.keyword) describe("Primary keyword", brief.primaryKeyword)
    for (const keyword of brief.secondaryKeywords || []) {
      if (keyword?.keyword) describe("Secondary keyword", keyword)
    }
    for (const keyword of brief.tagCandidates || []) {
      if (keyword?.keyword) describe("Tag candidate", keyword)
    }
    for (const listing of brief.competitorListings || []) {
      if (!listing?.tags?.length) continue
      const signals = [
        listing.estimatedMonthlySales != null ? `~${listing.estimatedMonthlySales} sales/month` : null,
        listing.listingScore != null ? `listing score ${listing.listingScore}` : null,
      ].filter(Boolean)
      lines.push(`Competitor listing${signals.length ? ` (${signals.join(", ")})` : ""}${listing.title ? ` "${listing.title}"` : ""}: tags ${listing.tags.join(" | ")}`)
    }
    if (brief.collection) lines.push(`Collection: ${brief.collection}`)
    if (brief.rationale) lines.push(`Why this design: ${brief.rationale}`)
    return lines.length ? lines.join("\n") : null
  } catch {
    return null
  }
}

/**
 * Imagen del diseño para el SEO, como en Scale: el archivo final real (el PNG en
 * PNG Designs, el 16:9 en Frame TV, la proporción principal en Wall Art), no un
 * mockup. Si faltara, la vista previa.
 */
export function designFileForSeo(job: AutomationJob, files: AutomationJobFile[]) {
  const contract = getProductionProductContract(job.productType)
  const fieldId = contract.delivery.requiredFieldIds.find((id) => id !== "instructions")
  const file = (fieldId && fileBySlot(files, `deliverable:${fieldId}`)) || fileBySlot(files, "listing:12")
  if (!file?.r2Key) throw new PostProductionError("No hay imagen del diseño en R2 para generar el SEO.")
  return file
}

function parseSeo(job: AutomationJob): EtsySeoResult {
  if (!job.seoJson) throw new PostProductionError("El SEO de este listing no está generado.")
  return JSON.parse(job.seoJson) as EtsySeoResult
}

// ---- Pasos ----

type StepContext = { job: AutomationJob; deps: PostProductionDeps; files: AutomationJobFile[] }

async function etsyDraft({ job, deps }: StepContext): Promise<DraftRef> {
  if (!job.etsyDraftId) throw new PostProductionError("El trabajo no tiene draft de Etsy asignado.")
  const token = await deps.getEtsyToken()
  if (!token) throw new PostProductionError("Etsy no está conectado en Autolisty. Conéctalo y reintenta.")
  return { token, shopId: await deps.getShopId(token), listingId: job.etsyDraftId }
}

function move(ctx: StepContext, to: AutomationJobStatus, message?: string) {
  ctx.job = ctx.deps.repository.transitionJob(ctx.job.id, to, { message })
  return ctx.job
}

async function stepAssignDraft(ctx: StepContext) {
  // Antes de gastar un draft, comprobar que el listing tiene todas sus fotos.
  listingImagesInEtsyOrder(ctx.job, ctx.files, ctx.deps.publicUrl)
  const draftId = ctx.deps.repository.assignDraftToJob(ctx.job.id)
  if (!draftId) {
    const label = getProductionProductContract(ctx.job.productType).label
    throw new PostProductionError(`No quedan drafts de Etsy disponibles para ${label}. Añade drafts en Automation y reintenta.`)
  }
  move(ctx, "DRAFT_ASSIGNED", `Draft de Etsy ${draftId} asignado.`)
}

async function stepSeo(ctx: StepContext) {
  if (ctx.job.status === "DRAFT_ASSIGNED") move(ctx, "SEO_GENERATING")
  const images = listingImagesInEtsyOrder(ctx.job, ctx.files, ctx.deps.publicUrl)
  const design = designFileForSeo(ctx.job, ctx.files)
  const seo = await ctx.deps.generateSeo({
    productType: ctx.job.productType,
    draftListingId: ctx.job.etsyDraftId!,
    designUrl: ctx.deps.publicUrl(design.r2Key!),
    mockups: images,
    midjourneyPrompt: ctx.job.sourcePrompt,
    listingId: ctx.job.productCode,
    keywordResearch: keywordResearchFromBrief(ctx.job.briefJson),
  })
  ctx.deps.repository.updatePostProductionFields(ctx.job.id, { seoJson: JSON.stringify(seo) })
  move(ctx, "SEO_READY", `SEO generado: ${seo.title}`)
}

async function stepDelivery(ctx: StepContext) {
  if (ctx.job.status === "SEO_READY") move(ctx, "DELIVERY_PREPARING")
  const option = getProductOption(ctx.job.productType)
  let delivery: { url: string; filename: string }
  if (option.delivery.mode === "direct") {
    const design = fileBySlot(ctx.files, "deliverable:design")
    if (!design?.r2Key) throw new PostProductionError("Falta el Design.png verificado en R2.")
    delivery = { url: ctx.deps.publicUrl(design.r2Key), filename: "Design.png" }
  } else {
    const pdf = await ctx.deps.buildDeliveryPdf(ctx.job.productType, ctx.job.productCode)
    delivery = { url: pdf.url, filename: `${ctx.job.productCode}.pdf` }
  }
  ctx.deps.repository.updatePostProductionFields(ctx.job.id, {
    deliveryUrl: delivery.url,
    deliveryFilename: delivery.filename,
  })
  move(ctx, "DELIVERY_READY", `Entrega lista: ${delivery.filename}`)
}

async function stepEtsyText(ctx: StepContext) {
  if (ctx.job.status === "DELIVERY_READY") move(ctx, "ETSY_TEXT_SYNCING")
  const seo = parseSeo(ctx.job)
  await ctx.deps.syncText(await etsyDraft(ctx), {
    title: seo.title,
    description: seo.description_final,
    tags: seo.tags_13,
    attributes: (seo.etsy_attributes || []).map((attribute) => ({
      propertyId: attribute.propertyId,
      valueIds: attribute.valueIds,
      values: attribute.values,
      scaleId: attribute.scaleId ?? null,
    })),
  })
  move(ctx, "ETSY_MEDIA_SYNCING", "Título, descripción, tags y atributos en Etsy.")
}

async function stepEtsyMedia(ctx: StepContext) {
  const seo = parseSeo(ctx.job)
  const altById = new Map((seo.media || []).map((item) => [item.id, item.alt_text]))
  const images = listingImagesInEtsyOrder(ctx.job, ctx.files, ctx.deps.publicUrl)
  await ctx.deps.syncImages(
    await etsyDraft(ctx),
    images.map((image) => ({ url: image.url, rank: image.position, altText: altById.get(image.id) }))
  )
  move(ctx, "ETSY_FILE_SYNCING", `${images.length} fotos subidas a Etsy.`)
}

async function stepEtsyFile(ctx: StepContext) {
  if (!ctx.job.deliveryUrl || !ctx.job.deliveryFilename) {
    throw new PostProductionError("No hay archivo de entrega preparado.")
  }
  await ctx.deps.syncFile(await etsyDraft(ctx), { url: ctx.job.deliveryUrl, filename: ctx.job.deliveryFilename })
  const video = fileBySlot(ctx.files, "listing:2")
  if (video?.r2Key) {
    move(ctx, "ETSY_VIDEO_SYNCING", "Archivo digital subido a Etsy.")
  } else {
    waitForReview(ctx, "Archivo digital subido a Etsy. Draft listo para revisar.")
  }
}

async function stepEtsyVideo(ctx: StepContext) {
  const video = fileBySlot(ctx.files, "listing:2")
  try {
    if (video?.r2Key) {
      await ctx.deps.syncVideo(await etsyDraft(ctx), {
        url: ctx.deps.publicUrl(video.r2Key),
        name: `${ctx.job.productCode}.mp4`,
      })
    }
    waitForReview(ctx, "Video subido. Draft listo para revisar.")
  } catch (error) {
    // El video es opcional: si Etsy lo rechaza, el draft sigue adelante sin él.
    ctx.deps.repository.recordJobEvent(ctx.job.id, "WARNING", `No se pudo subir el video: ${errorMessage(error)}`)
    waitForReview(ctx, "Draft listo para revisar (sin video).")
  }
}

function waitForReview(ctx: StepContext, message: string) {
  move(ctx, "WAITING_ETSY_REVIEW", message)
  const now = (ctx.deps.now || (() => new Date()))()
  ctx.job = ctx.deps.repository.updatePostProductionFields(ctx.job.id, {
    etsyState: "draft",
    nextAttemptAt: new Date(now.getTime() + ETSY_REVIEW_POLL_MS).toISOString(),
  })!
}

async function stepCheckPublished(ctx: StepContext) {
  const draft = await etsyDraft(ctx)
  const listing = await ctx.deps.getListing(draft.token, draft.shopId, draft.listingId)
  const state = String(listing?.state || "")
  if (state === "active") {
    ctx.deps.repository.updatePostProductionFields(ctx.job.id, {
      etsyState: state,
      etsyUrl: String(listing?.url || "") || null,
    })
    move(ctx, "ETSY_ACTIVE", "Publicado en Etsy.")
    return
  }
  const now = (ctx.deps.now || (() => new Date()))()
  ctx.job = ctx.deps.repository.updatePostProductionFields(ctx.job.id, {
    etsyState: state || null,
    nextAttemptAt: new Date(now.getTime() + ETSY_REVIEW_POLL_MS).toISOString(),
  })!
}

async function stepPinterest(ctx: StepContext) {
  if (ctx.job.status === "ETSY_ACTIVE") move(ctx, "PINTEREST_PUBLISHING")
  const etsyUrl = ctx.job.etsyUrl
  if (!etsyUrl) throw new PostProductionError("Falta la URL pública del listing de Etsy.")
  const token = await ctx.deps.getPinterestToken()
  if (!token) throw new PostProductionError("Pinterest no está conectado en Autolisty. Conéctalo y reintenta.")

  let plan = ctx.job.pinterestSeoJson ? (JSON.parse(ctx.job.pinterestSeoJson) as PinterestPlan) : null
  if (!plan) {
    // El tablero se llama exactamente como el producto (p. ej. "Frame TV Art").
    const boardName = getProductionProductContract(ctx.job.productType).label
    const board = await ctx.deps.findBoard(token, boardName)
    if (!board) throw new PostProductionError(`No hay un tablero de Pinterest llamado "${boardName}".`)

    const images = [1, 2, 3].map((index) => {
      const file = fileBySlot(ctx.files, `pinterest:${index}`)
      if (!file?.r2Key) throw new PostProductionError(`Falta el pin ${index} en R2.`)
      return { id: `pin-${index}`, url: ctx.deps.publicUrl(file.r2Key) }
    })
    const seo = parseSeo(ctx.job)
    const copy = await ctx.deps.generatePinCopy({
      productType: ctx.job.productType,
      listingTitle: seo.title,
      listingDescription: seo.description_final,
      listingKeywords: [...briefKeywords(ctx.job.briefJson), ...seo.description_keywords_5],
      destinationLink: etsyUrl,
      pins: images,
    })
    plan = {
      boardId: board.id,
      boardName: board.name,
      pins: images.map((image, index) => {
        const text = copy.pins.find((item) => item.id === image.id) || copy.pins[index]
        return {
          id: image.id,
          imageUrl: image.url,
          title: text?.title || seo.title.slice(0, 100),
          description: text?.description || "",
          pinId: null,
        }
      }),
    }
    ctx.job = ctx.deps.repository.updatePostProductionFields(ctx.job.id, { pinterestSeoJson: JSON.stringify(plan) })!
  }

  for (const pin of plan.pins) {
    if (pin.pinId) continue
    const published = await ctx.deps.publishPin(token, {
      boardId: plan.boardId,
      title: pin.title,
      description: pin.description,
      link: etsyUrl,
      imageUrl: pin.imageUrl,
    })
    pin.pinId = published.pinId
    ctx.job = ctx.deps.repository.updatePostProductionFields(ctx.job.id, { pinterestSeoJson: JSON.stringify(plan) })!
    try {
      ctx.deps.recordPin({
        pinId: published.pinId,
        boardId: published.boardId,
        title: pin.title,
        destinationUrl: etsyUrl,
        imageUrl: pin.imageUrl,
      })
    } catch (error) {
      ctx.deps.repository.recordJobEvent(ctx.job.id, "WARNING", `Pin publicado pero sin vínculo analítico: ${errorMessage(error)}`)
    }
  }
  move(ctx, "COMPLETED", `${plan.pins.length} pines publicados en "${plan.boardName}".`)
}

const STEP_BY_STATUS: Partial<Record<AutomationJobStatus, (ctx: StepContext) => Promise<void>>> = {
  LOCAL_COMPLETE: stepAssignDraft,
  DRAFT_ASSIGNED: stepSeo,
  SEO_GENERATING: stepSeo,
  SEO_READY: stepDelivery,
  DELIVERY_PREPARING: stepDelivery,
  DELIVERY_READY: stepEtsyText,
  ETSY_TEXT_SYNCING: stepEtsyText,
  ETSY_MEDIA_SYNCING: stepEtsyMedia,
  ETSY_FILE_SYNCING: stepEtsyFile,
  ETSY_VIDEO_SYNCING: stepEtsyVideo,
  WAITING_ETSY_REVIEW: stepCheckPublished,
  ETSY_ACTIVE: stepPinterest,
  PINTEREST_PUBLISHING: stepPinterest,
}

// Estados en los que el worker se detiene con este trabajo y pasa al siguiente.
const STOP_STATUSES = new Set<AutomationJobStatus>(["WAITING_ETSY_REVIEW", "COMPLETED"])

/** Avanza un trabajo todo lo posible. Devuelve el estado final. */
export async function advanceJob(job: AutomationJob, deps: PostProductionDeps): Promise<AutomationJob> {
  const ctx: StepContext = { job, deps, files: verifiedFiles(deps.repository, job.id) }

  if (ctx.job.status === "RETRY_WAIT") {
    if (!ctx.job.resumeStatus || !SERVER_STATUSES.has(ctx.job.resumeStatus)) return ctx.job
    move(ctx, ctx.job.resumeStatus, "Reintento automático.")
  }

  for (let guard = 0; guard < 14; guard += 1) {
    const step = STEP_BY_STATUS[ctx.job.status]
    if (!step) break
    const before = ctx.job.status
    try {
      await step(ctx)
    } catch (error) {
      // Retomar en el estado en el que se quedó (p. ej. SEO_GENERATING, no DRAFT_ASSIGNED).
      const resumeStatus = ctx.job.status
      const transient = isTransient(error)
      const canRetry = transient && ctx.job.retryCount < MAX_AUTOMATIC_RETRIES
      const now = (deps.now || (() => new Date()))()
      ctx.job = deps.repository.transitionJob(ctx.job.id, canRetry ? "RETRY_WAIT" : "NEEDS_ATTENTION", {
        error: errorMessage(error),
        resumeStatus,
        nextAttemptAt: canRetry ? new Date(now.getTime() + RETRY_DELAY_MS).toISOString() : null,
      })
      break
    }
    if (STOP_STATUSES.has(ctx.job.status)) break
    // Sin cambio de estado = el paso está esperando (revisión en Etsy, siguiente pin).
    if (ctx.job.status === before) break
  }
  return ctx.job
}

/** Una pasada: avanza cada trabajo pendiente (uno tras otro, nunca en paralelo). */
export async function runPostProductionTick(deps: PostProductionDeps, limit = 10) {
  const candidates = [
    ...deps.repository.listPostProductionJobs(POST_PRODUCTION_STATUSES, limit),
    ...deps.repository.listPostProductionJobs(["RETRY_WAIT"], limit)
      .filter((job) => job.resumeStatus && SERVER_STATUSES.has(job.resumeStatus)),
  ]
  const results: Array<{ productCode: string; status: AutomationJobStatus }> = []
  for (const job of candidates) {
    const updated = await advanceJob(job, deps)
    results.push({ productCode: updated.productCode, status: updated.status })
  }
  return results
}
