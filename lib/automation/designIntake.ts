import { PRODUCT_OPTIONS, type ProductType } from "../products"
import { getProductionProductContract } from "./productContracts"

// Contrato del paquete que Claude envía con cada diseño (POST /api/claude/designs).
// Todo lo que no sea imagen, producto y prompt es contexto opcional: se guarda en
// brief_json para el SEO y para que Claude aprenda de aprobaciones y rechazos.

export const CROP_ANCHORS = ["center", "top", "bottom", "left", "right"] as const
export type CropAnchor = (typeof CROP_ANCHORS)[number]

export type KeywordMetric = {
  keyword: string
  etsyMonthlySearches?: number | null
  competingListings?: number | null
  competition?: string | null
  trend3m?: number | null
}

// Anuncios de la competencia que ganan en la keyword: sus tags muestran qué
// combinaciones funcionan (ponderadas por ventas estimadas y la nota de Alura).
export type CompetitorListing = {
  title: string | null
  tags: string[]
  estimatedMonthlySales: number | null
  listingScore: number | null
}

export type DesignBrief = {
  primaryKeyword: KeywordMetric | null
  secondaryKeywords: KeywordMetric[]
  // Keywords con datos reales de Alura candidatas a tag (no obligatorias).
  tagCandidates?: KeywordMetric[]
  competitorListings?: CompetitorListing[]
  collection: string | null
  cropAnchor: CropAnchor
  rationale: string | null
  kittl: {
    uploadId: string | null
    modelId: string | null
    aspectRatio: string | null
  }
  researchSource: string | null
}

export type DesignSubmission = {
  productType: ProductType
  prompt: string
  imageUrl: URL
  brief: DesignBrief
}

export const MAX_DESIGN_SOURCE_BYTES = 100 * 1024 * 1024
const PRODUCT_TYPES = new Set<string>(PRODUCT_OPTIONS.map((product) => product.value))
const ALLOWED_IMAGE_HOST_SUFFIXES = [".kittl.com"]

export class DesignSubmissionError extends Error {}

function text(value: unknown, field: string, max: number, required = false): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new DesignSubmissionError(`"${field}" is required.`)
    return null
  }
  if (typeof value !== "string") throw new DesignSubmissionError(`"${field}" must be a string.`)
  const trimmed = value.trim()
  if (required && !trimmed) throw new DesignSubmissionError(`"${field}" is required.`)
  if (trimmed.length > max) throw new DesignSubmissionError(`"${field}" exceeds ${max} characters.`)
  return trimmed || null
}

function optionalNumber(value: unknown, field: string) {
  if (value === undefined || value === null) return null
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DesignSubmissionError(`"${field}" must be a finite number.`)
  }
  return value
}

function keywordMetric(value: unknown, field: string): KeywordMetric {
  if (typeof value === "string") return { keyword: text(value, field, 120, true)! }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DesignSubmissionError(`"${field}" must be a keyword string or object.`)
  }
  const item = value as Record<string, unknown>
  return {
    keyword: text(item.keyword, `${field}.keyword`, 120, true)!,
    etsyMonthlySearches: optionalNumber(item.etsyMonthlySearches, `${field}.etsyMonthlySearches`),
    competingListings: optionalNumber(item.competingListings, `${field}.competingListings`),
    competition: text(item.competition, `${field}.competition`, 30),
    trend3m: optionalNumber(item.trend3m, `${field}.trend3m`),
  }
}

export function isAllowedDesignImageUrl(url: URL) {
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false
  const host = url.hostname.toLowerCase()
  return ALLOWED_IMAGE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix) && host.length > suffix.length)
}

export function parseDesignSubmission(body: unknown): DesignSubmission {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new DesignSubmissionError("Body must be a JSON object.")
  }
  const input = body as Record<string, unknown>

  const productType = text(input.productType, "productType", 40, true)!
  if (!PRODUCT_TYPES.has(productType)) throw new DesignSubmissionError(`Unknown productType "${productType}".`)

  const prompt = text(input.prompt, "prompt", 4000, true)!

  let imageUrl: URL
  try {
    imageUrl = new URL(text(input.imageUrl, "imageUrl", 2000, true)!)
  } catch {
    throw new DesignSubmissionError('"imageUrl" must be a valid URL.')
  }
  if (!isAllowedDesignImageUrl(imageUrl)) {
    throw new DesignSubmissionError('"imageUrl" must be an https URL on kittl.com.')
  }

  const secondaryRaw = input.secondaryKeywords ?? []
  if (!Array.isArray(secondaryRaw) || secondaryRaw.length > 20) {
    throw new DesignSubmissionError('"secondaryKeywords" must be an array of at most 20 items.')
  }

  const tagRaw = input.tagCandidates ?? []
  if (!Array.isArray(tagRaw) || tagRaw.length > 40) {
    throw new DesignSubmissionError('"tagCandidates" must be an array of at most 40 items.')
  }
  const competitorRaw = input.competitorListings ?? []
  if (!Array.isArray(competitorRaw) || competitorRaw.length > 8) {
    throw new DesignSubmissionError('"competitorListings" must be an array of at most 8 items.')
  }
  const competitorListings = competitorRaw.map((item, index): CompetitorListing => {
    const field = `competitorListings[${index}]`
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new DesignSubmissionError(`"${field}" must be an object.`)
    }
    const value = item as Record<string, unknown>
    const tags = value.tags ?? []
    if (!Array.isArray(tags) || tags.length > 13) {
      throw new DesignSubmissionError(`"${field}.tags" must be an array of at most 13 tags.`)
    }
    return {
      title: text(value.title, `${field}.title`, 200),
      tags: tags.map((tag, tagIndex) => text(tag, `${field}.tags[${tagIndex}]`, 40, true)!),
      estimatedMonthlySales: optionalNumber(value.estimatedMonthlySales, `${field}.estimatedMonthlySales`),
      listingScore: optionalNumber(value.listingScore, `${field}.listingScore`),
    }
  })

  const cropAnchor = (text(input.cropAnchor, "cropAnchor", 10) || "center") as CropAnchor
  if (!CROP_ANCHORS.includes(cropAnchor)) {
    throw new DesignSubmissionError(`"cropAnchor" must be one of: ${CROP_ANCHORS.join(", ")}.`)
  }

  const kittlRaw = input.kittl ?? {}
  if (!kittlRaw || typeof kittlRaw !== "object" || Array.isArray(kittlRaw)) {
    throw new DesignSubmissionError('"kittl" must be an object.')
  }
  const kittl = kittlRaw as Record<string, unknown>

  return {
    productType: productType as ProductType,
    prompt,
    imageUrl,
    brief: {
      primaryKeyword: input.primaryKeyword == null ? null : keywordMetric(input.primaryKeyword, "primaryKeyword"),
      secondaryKeywords: secondaryRaw.map((item, index) => keywordMetric(item, `secondaryKeywords[${index}]`)),
      tagCandidates: tagRaw.map((item, index) => keywordMetric(item, `tagCandidates[${index}]`)),
      competitorListings,
      collection: text(input.collection, "collection", 120),
      cropAnchor,
      rationale: text(input.rationale, "rationale", 2000),
      kittl: {
        uploadId: text(kittl.uploadId, "kittl.uploadId", 120),
        modelId: text(kittl.modelId, "kittl.modelId", 120),
        aspectRatio: text(kittl.aspectRatio, "kittl.aspectRatio", 20),
      },
      researchSource: text(input.researchSource, "researchSource", 60),
    },
  }
}

// Tipo real del archivo por sus primeros bytes (no por la extensión ni la cabecera HTTP).
export function sniffImageMimeType(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png"
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp"
  }
  return null
}

export function assertSourceAcceptedForProduct(productType: ProductType, mimeType: string | null) {
  const contract = getProductionProductContract(productType)
  if (!mimeType || !contract.source.acceptedMimeTypes.includes(mimeType)) {
    throw new DesignSubmissionError(
      `Image type ${mimeType || "unknown"} is not accepted for ${contract.label} (${contract.source.acceptedMimeTypes.join(", ")}).`
    )
  }
  return mimeType
}

/** Ancho, alto y transparencia leídos de la cabecera PNG (IHDR y tRNS), sin decodificar. */
export function readPngInfo(bytes: Uint8Array): { width: number; height: number; hasAlpha: boolean } | null {
  if (sniffImageMimeType(bytes) !== "image/png" || bytes.length < 33) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  const colorType = bytes[25]
  let hasAlpha = colorType === 4 || colorType === 6
  // tRNS (transparencia en PNG de paleta/RGB) aparece antes de IDAT.
  let offset = 8
  while (!hasAlpha && offset + 8 <= bytes.length) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8))
    if (type === "tRNS") hasAlpha = true
    if (type === "IDAT" || type === "IEND") break
    offset += 12 + length
  }
  return { width, height, hasAlpha }
}

export const PNG_DESIGN_MIN_SIZE = 4096

/**
 * PNG Designs: el entregable es el propio PNG (Autobuildy no lo escala), así que
 * debe llegar ya a 4096 px, cuadrado y con transparencia. Se rechaza al enviarlo,
 * no al día siguiente en Automaty.
 */
export function assertPngDesignReady(productType: ProductType, bytes: Uint8Array) {
  if (productType !== "png_designs") return
  const info = readPngInfo(bytes)
  if (!info) throw new DesignSubmissionError("PNG Designs needs a PNG file.")
  const problems: string[] = []
  if (info.width < PNG_DESIGN_MIN_SIZE || info.height < PNG_DESIGN_MIN_SIZE) {
    problems.push(`it is ${info.width} x ${info.height} px and must be at least ${PNG_DESIGN_MIN_SIZE} x ${PNG_DESIGN_MIN_SIZE} px`)
  }
  if (Math.abs(1 - info.width / info.height) > 0.02) problems.push("the canvas must be square")
  if (!info.hasAlpha) problems.push("it has no transparency")
  if (problems.length) {
    throw new DesignSubmissionError(
      `PNG design not ready: ${problems.join("; ")}. Upscale it with kittl-upscale-image (free) to 4096 px, then remove the background, and submit that result.`
    )
  }
}

/** Avisos al enviar (M6): problemas que el SEO descubriría después. */
export function submissionWarnings(brief: {
  primaryKeyword?: { keyword: string } | null
  tagCandidates?: Array<{ keyword: string }>
}) {
  const warnings: string[] = []
  if (!brief.primaryKeyword?.keyword) warnings.push("No primaryKeyword: the SEO will not know the main search phrase.")
  const long = (brief.tagCandidates || []).filter((tag) => tag.keyword.trim().length > 20).map((tag) => tag.keyword)
  if (long.length) warnings.push(`Tag candidates over 20 characters will be dropped: ${long.join(", ")}.`)
  if ((brief.tagCandidates || []).length < 13) warnings.push(`Only ${(brief.tagCandidates || []).length} tag candidates; send at least 13 real searched phrases.`)
  return warnings
}

