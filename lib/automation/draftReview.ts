// Revisión de un listing (draft o publicado) para Claude vía MCP: lo que generó
// Autolisty frente a lo que hay de verdad en Etsy, con comprobaciones objetivas.
import { getFreshToken } from "../integrations/tokenSession"
import { getPrimaryShop, getShopListing, listListingFiles, listListingImages } from "../etsy/listings"
import { getListingProperties } from "../etsy/attributes"
import { getEditableAttributes } from "../etsy/attributeOptions"
import type { EtsySeoResult } from "../seo/etsySeo"
import { getProductionProductContract } from "./productContracts"
import { fixedImageAltText } from "../seo/fixedImageAltTexts"
import { AutomationRepository } from "./repository"
import { keywordResearchFromBrief } from "./postProduction"

type EtsyImage = { listing_image_id?: number; rank?: number; alt_text?: string | null; url_570xN?: string; url_fullxfull?: string }
type EtsyFile = { listing_file_id?: number; filename?: string; filesize?: string; size_bytes?: number }

function imageRole(slot: number, previewSlot: number, fixed: readonly number[]) {
  if (slot === 1) return "main mockup (cover)"
  if (slot === previewSlot) return "Artwork Preview (flat final file)"
  if (fixed.includes(slot)) return "fixed shop image (same on every listing of this product)"
  return "room mockup"
}

export async function reviewListingDraft(input: { productCode?: unknown }) {
  const productCode = typeof input.productCode === "string" ? input.productCode.trim() : ""
  if (!/^LBCreaStudio-[A-Z0-9]{6}$/.test(productCode)) throw new Error('productCode must look like "LBCreaStudio-ABC123".')

  const repository = new AutomationRepository()
  const job = repository.getJobByProductCode(productCode)
  if (!job) throw new Error(`No listing found for ${productCode}.`)
  if (!job.etsyDraftId) throw new Error(`${productCode} has no Etsy draft yet (status ${job.status}).`)

  const contract = getProductionProductContract(job.productType)
  const seo = job.seoJson ? (JSON.parse(job.seoJson) as EtsySeoResult) : null
  const order = contract.listing.etsyImageOrder
  const expectedImages = order.map((slot, index) => ({
    rank: index + 1,
    sourceFile: `${slot}.jpg`,
    role: imageRole(slot, contract.listing.previewSlot, contract.listing.fixedImageSlots),
    generatedAltText: fixedImageAltText(job.productType, slot) ?? seo?.media?.find((item) => item.position === index + 1)?.alt_text ?? null,
  }))

  const token = await getFreshToken("etsy")
  if (!token) throw new Error("Etsy is not connected in Autolisty.")
  const shopId = Number((await getPrimaryShop(token)).shop_id)
  const step = <T,>(label: string, promise: Promise<T>) =>
    promise.catch((error: unknown) => {
      throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`)
    })
  const [listing, images, files, properties] = await Promise.all([
    step("Reading the Etsy listing", getShopListing(token, shopId, job.etsyDraftId)),
    step("Reading the Etsy photos", listListingImages(token, shopId, job.etsyDraftId)) as Promise<EtsyImage[]>,
    listListingFiles(token, shopId, job.etsyDraftId).catch(() => []) as Promise<EtsyFile[]>,
    getListingProperties(token, shopId, job.etsyDraftId).catch(() => []),
  ])

  const etsyImages = [...images].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)).map((image) => ({
    rank: image.rank ?? null,
    altText: image.alt_text || null,
    url: image.url_570xN || image.url_fullxfull || null,
    expected: expectedImages.find((item) => item.rank === image.rank) ?? null,
  }))

  // Opciones válidas de los atributos que se pueden corregir (por categoría del draft).
  const attributeOptions = await getEditableAttributes(token, Number(listing?.taxonomy_id), job.productType)
    .then((items) => items.map((item) => ({ name: item.name, maxValues: item.maxValues, options: item.options.map((option) => option.name) })))
    .catch(() => [])

  const title = String(listing?.title || "")
  const tags: string[] = Array.isArray(listing?.tags) ? listing.tags : []
  const altTexts = etsyImages.map((image) => image.altText).filter(Boolean) as string[]
  const checks = [
    { check: "title length ≤ 140", ok: title.length <= 140, detail: `${title.length} characters` },
    { check: "13 tags", ok: tags.length === 13, detail: `${tags.length} tags` },
    { check: "tags ≤ 20 characters", ok: tags.every((tag) => tag.length <= 20), detail: tags.filter((tag) => tag.length > 20).join(", ") || "ok" },
    { check: "no duplicate tags", ok: new Set(tags.map((tag) => tag.toLowerCase())).size === tags.length, detail: "" },
    { check: `${order.length} photos`, ok: etsyImages.length === order.length, detail: `${etsyImages.length} photos on Etsy` },
    { check: "every photo has alt text", ok: etsyImages.every((image) => Boolean(image.altText)), detail: etsyImages.filter((image) => !image.altText).map((image) => `rank ${image.rank}`).join(", ") || "ok" },
    { check: "no repeated alt text", ok: new Set(altTexts).size === altTexts.length, detail: "" },
    { check: "digital file attached", ok: files.length > 0, detail: files.map((file) => file.filename).join(", ") || "none" },
    // Como en Scale, la descripción lleva el código corto (p. ej. "LR16N6").
    { check: "product code in description", ok: String(listing?.description || "").includes(productCode.split("-").pop()!), detail: productCode.split("-").pop()! },
  ]

  return {
    productCode,
    productType: job.productType,
    product: contract.label,
    status: job.status,
    etsyDraftId: job.etsyDraftId,
    etsyState: listing?.state ?? null,
    etsyUrl: listing?.url ?? job.etsyUrl,
    keywordResearch: keywordResearchFromBrief(job.briefJson),
    designPrompt: job.sourcePrompt,
    etsy: {
      title,
      tags,
      description: listing?.description ?? null,
      price: listing?.price ?? null,
      attributes: properties,
      attributeOptions,
      images: etsyImages,
      files: files.map((file) => ({ filename: file.filename, size: file.filesize ?? file.size_bytes ?? null })),
    },
    generatedByAutolisty: seo ? { title: seo.title, tags: seo.tags_13, attributes: seo.etsy_attributes } : null,
    checks,
  }
}
