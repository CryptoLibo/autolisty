// Pasos para rellenar un draft de Etsy. Los usa la ruta manual /api/etsy/sync
// (Listing/Scale) y el flujo automático del servidor, que los ejecuta como
// estados separados (texto → imágenes → archivo → video) para poder reintentar
// cada uno sin repetir los demás.
import { getSellerTaxonomyProperties, updateListingProperty } from "./attributes"
import { matchFixedValues } from "./fixedAttributes"
import { readR2Object } from "../r2/readObject"
import { currentPublicUrl, privateKeyFromPublicUrl } from "../r2/privateKey"
import { getShopListing } from "./listings"
import type { EtsyTokenPayload } from "./auth"
import {
  deleteListingFile,
  deleteListingImage,
  listListingFiles,
  listListingImages,
  updateShopListingText,
  uploadListingFile,
  uploadListingImage,
} from "./listings"
import { etsyFetch } from "./client"

export type DraftSyncMockup = {
  url: string
  altText?: string
  rank: number
}

export type DraftSyncAttribute = {
  propertyId: number
  valueIds: number[]
  values: string[]
  scaleId: number | null
}

type DraftRef = { token: EtsyTokenPayload; shopId: number; listingId: string }

type EtsyExistingImage = { listing_image_id?: number }
type EtsyExistingFile = { listing_file_id?: number }

export function getFilenameFromUrl(url: string, fallback: string) {
  try {
    const parsed = new URL(url)
    const last = parsed.pathname.split("/").filter(Boolean).pop()
    return decodeURIComponent(last || fallback)
  } catch {
    return fallback
  }
}

export async function fetchAsset(rawUrl: string) {
  const url = currentPublicUrl(rawUrl)
  // Entregables y PDF de entrega: por la API de R2 (el dominio público los bloquea).
  const privateKey = privateKeyFromPublicUrl(url)
  if (privateKey) return readR2Object(privateKey)
  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) throw new Error(`Failed to fetch asset from ${url}`)
  const arrayBuffer = await response.arrayBuffer()
  const contentType = response.headers.get("content-type") || "application/octet-stream"
  return { fileBuffer: Buffer.from(arrayBuffer), contentType }
}

export function wrapStepError(step: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown Etsy integration error."
  return new Error(`${step}: ${message}`)
}

function isMissingEtsySubresource(error: unknown) {
  if (!(error instanceof Error)) return false
  return /resource not found/i.test(error.message)
}

export async function syncDraftText(
  { token, shopId, listingId }: DraftRef,
  input: { title: string; description: string; tags: string[]; attributes: DraftSyncAttribute[]; fixedAttributes?: Record<string, string[]> }
) {
  try {
    await updateShopListingText({
      token,
      shopId,
      listingId,
      title: input.title,
      description: input.description,
      tags: input.tags,
    })
  } catch (error) {
    throw wrapStepError("Failed while updating Etsy listing text", error)
  }

  for (const attribute of input.attributes) {
    try {
      await updateListingProperty({
        token,
        shopId,
        listingId,
        propertyId: attribute.propertyId,
        valueIds: attribute.valueIds,
        values: attribute.values,
        scaleId: attribute.scaleId,
      })
    } catch (error) {
      throw wrapStepError(`Failed while updating Etsy attribute ${attribute.propertyId}`, error)
    }
  }

  if (input.fixedAttributes && Object.keys(input.fixedAttributes).length > 0) {
    await applyFixedAttributes({ token, shopId, listingId }, input.fixedAttributes)
  }
}

/** Atributos fijos del producto (p. ej. Aspect ratio), por nombre de propiedad y de opción. */
export async function applyFixedAttributes({ token, shopId, listingId }: DraftRef, fixed: Record<string, string[]>) {
  const listing = await getShopListing(token, shopId, listingId) as { taxonomy_id?: number } | null
  const taxonomyId = Number(listing?.taxonomy_id)
  if (!taxonomyId) return
  const properties = await getSellerTaxonomyProperties(token, taxonomyId)
  for (const [name, wanted] of Object.entries(fixed)) {
    const property = properties.find((item) =>
      String(item.display_name || item.name || "").trim().toLowerCase() === name.toLowerCase())
    if (!property) continue
    const options = (Array.isArray(property.possible_values) ? property.possible_values : [])
      .map((value) => ({ valueId: Number(value.value_id), name: String(value.name || "").trim() }))
    const { matched, missing } = matchFixedValues(wanted, options)
    if (missing.length) console.warn(`[draft-sync] ${name}: no Etsy option for ${missing.join(", ")}`)
    if (!matched.length) continue
    try {
      await updateListingProperty({
        token, shopId, listingId,
        propertyId: Number(property.property_id),
        valueIds: matched.map((option) => option.valueId),
        values: matched.map((option) => option.name),
        scaleId: null,
      })
    } catch (error) {
      throw wrapStepError(`Failed while updating Etsy attribute ${name}`, error)
    }
  }
}

/** Sustituye todas las imágenes del draft por las indicadas (en el orden de rank). */
export async function syncDraftImages({ token, shopId, listingId }: DraftRef, mockups: DraftSyncMockup[]) {
  let existingImages: EtsyExistingImage[] = []
  try {
    existingImages = await listListingImages(token, shopId, listingId)
  } catch (error) {
    if (!isMissingEtsySubresource(error)) {
      throw wrapStepError("Failed while reading existing Etsy listing images", error)
    }
  }

  for (const image of existingImages) {
    if (!image.listing_image_id) continue
    try {
      await deleteListingImage(token, shopId, listingId, image.listing_image_id)
    } catch (error) {
      throw wrapStepError("Failed while deleting an existing Etsy listing image", error)
    }
  }

  for (const mockup of mockups) {
    try {
      const asset = await fetchAsset(mockup.url)
      await uploadListingImage({
        token,
        shopId,
        listingId,
        fileBuffer: asset.fileBuffer,
        contentType: asset.contentType,
        filename: getFilenameFromUrl(mockup.url, `mockup-${mockup.rank}.jpg`),
        rank: mockup.rank,
        altText: mockup.altText,
      })
    } catch (error) {
      throw wrapStepError(`Failed while uploading Etsy mockup image at position ${mockup.rank}`, error)
    }
  }
}

/** Sustituye el archivo digital del draft. */
export async function syncDraftFile(
  { token, shopId, listingId }: DraftRef,
  input: { url: string; filename: string }
) {
  let existingFiles: EtsyExistingFile[] = []
  try {
    existingFiles = await listListingFiles(token, shopId, listingId)
  } catch (error) {
    if (!isMissingEtsySubresource(error)) {
      throw wrapStepError("Failed while reading existing Etsy digital files", error)
    }
  }

  for (const file of existingFiles) {
    if (!file.listing_file_id) continue
    try {
      await deleteListingFile(token, shopId, listingId, file.listing_file_id)
    } catch (error) {
      throw wrapStepError("Failed while deleting an existing Etsy digital file", error)
    }
  }

  try {
    const deliveryFile = await fetchAsset(input.url)
    await uploadListingFile({
      token,
      shopId,
      listingId,
      fileBuffer: deliveryFile.fileBuffer,
      contentType: deliveryFile.contentType,
      filename: input.filename,
    })
  } catch (error) {
    throw wrapStepError("Failed while uploading the Etsy digital file", error)
  }
}

/** Sube el video del listing (Etsy admite 1 por la API de listings). */
export async function syncDraftVideo(
  { token, shopId, listingId }: DraftRef,
  input: { url: string; name: string }
) {
  const asset = await fetchAsset(input.url)
  const form = new FormData()
  form.append("video", new Blob([new Uint8Array(asset.fileBuffer)], { type: asset.contentType }), input.name)
  form.append("name", input.name)
  const response = await etsyFetch(`/application/shops/${shopId}/listings/${listingId}/videos`, token, {
    method: "POST",
    body: form,
  })
  if (!response.ok) {
    const message = await response.text().catch(() => "")
    throw new Error(`Failed while uploading the Etsy listing video (HTTP ${response.status}): ${message.slice(0, 300)}`)
  }
}
