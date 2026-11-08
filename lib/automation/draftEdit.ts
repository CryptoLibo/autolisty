// Corrección de un listing por Claude vía MCP. Solo funciona si el propietario
// lo autorizó para ESE listing desde Automation (permiso con caducidad), y cada
// cambio queda registrado con el antes, el después y el motivo: es la base de
// la retroalimentación para mejorar los siguientes listings.
import { getFreshToken } from "../integrations/tokenSession"
import { getPrimaryShop, getShopListing, listListingImages, setListingImageAltText, updateShopListingText } from "../etsy/listings"
import { deleteListingProperty, getListingProperties, updateListingProperty } from "../etsy/attributes"
import { getEditableAttributes } from "../etsy/attributeOptions"
import { AutomationRepository } from "./repository"

type EtsyImage = { listing_image_id?: number; rank?: number; alt_text?: string | null }

export type ListingEditInput = {
  productCode?: unknown
  title?: unknown
  description?: unknown
  tags?: unknown
  altTexts?: unknown
  attributes?: unknown
  reason?: unknown
}

function optionalString(value: unknown, field: string, max: number) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "string") throw new Error(`${field} must be a string.`)
  const clean = value.trim()
  if (!clean) throw new Error(`${field} cannot be empty.`)
  if (clean.length > max) throw new Error(`${field} must be at most ${max} characters (got ${clean.length}).`)
  return clean
}

export function parseListingEdit(input: ListingEditInput, productCode: string) {
  const reason = optionalString(input.reason, "reason", 1000)
  if (!reason) throw new Error("reason is required: explain what is wrong and why the change is better.")
  const title = optionalString(input.title, "title", 140)
  const description = optionalString(input.description, "description", 20_000)
  const shortCode = productCode.split("-").pop()!
  if (description && !description.includes(shortCode)) {
    throw new Error(`description must keep the product code ${shortCode} (as the last line, like every listing).`)
  }

  let tags: string[] | undefined
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || input.tags.length === 0 || input.tags.length > 13) {
      throw new Error("tags must be an array of 1 to 13 tags.")
    }
    tags = input.tags.map((tag, index) => optionalString(tag, `tags[${index}]`, 20)!)
    if (new Set(tags.map((tag) => tag.toLowerCase())).size !== tags.length) throw new Error("tags must not repeat.")
  }

  let altTexts: Array<{ rank: number; altText: string }> | undefined
  if (input.altTexts !== undefined) {
    if (!Array.isArray(input.altTexts) || input.altTexts.length === 0 || input.altTexts.length > 20) {
      throw new Error("altTexts must be an array of 1 to 20 { rank, altText } items.")
    }
    altTexts = input.altTexts.map((item, index) => {
      const value = (item || {}) as { rank?: unknown; altText?: unknown }
      const rank = Number(value.rank)
      if (!Number.isInteger(rank) || rank < 1 || rank > 20) throw new Error(`altTexts[${index}].rank must be the photo position (1-20).`)
      return { rank, altText: optionalString(value.altText, `altTexts[${index}].altText`, 250)! }
    })
  }

  let attributes: Array<{ name: string; values: string[] }> | undefined
  if (input.attributes !== undefined) {
    if (!Array.isArray(input.attributes) || input.attributes.length === 0 || input.attributes.length > 12) {
      throw new Error("attributes must be an array of 1 to 12 { name, values } items.")
    }
    attributes = input.attributes.map((item, index) => {
      const value = (item || {}) as { name?: unknown; values?: unknown }
      const name = optionalString(value.name, `attributes[${index}].name`, 60)!
      // values: [] quita el atributo (p. ej. una Occasion que no corresponde).
      if (!Array.isArray(value.values) || value.values.length > 10) {
        throw new Error(`attributes[${index}].values must list 0 to 10 option names (empty removes the attribute).`)
      }
      return { name, values: value.values.map((option, optionIndex) => optionalString(option, `attributes[${index}].values[${optionIndex}]`, 80)!) }
    })
  }

  if (!title && !description && !tags && !altTexts && !attributes) {
    throw new Error("Nothing to change: send title, description, tags, altTexts and/or attributes.")
  }
  return { reason, title, description, tags, altTexts, attributes }
}

export async function editListingDraft(input: ListingEditInput) {
  const productCode = typeof input.productCode === "string" ? input.productCode.trim() : ""
  const repository = new AutomationRepository()
  const job = productCode ? repository.getJobByProductCode(productCode) : null
  if (!job) throw new Error(`No listing found for "${productCode}".`)
  if (!job.etsyDraftId) throw new Error(`${productCode} has no Etsy listing yet.`)
  // La autorización la da el propietario en el chat, para estos cambios concretos.

  const edit = parseListingEdit(input, productCode)
  const token = await getFreshToken("etsy")
  if (!token) throw new Error("Etsy is not connected in Autolisty.")
  const shopId = Number((await getPrimaryShop(token)).shop_id)
  const listing = await getShopListing(token, shopId, job.etsyDraftId)

  const before = {
    title: String(listing?.title || ""),
    description: String(listing?.description || ""),
    tags: (Array.isArray(listing?.tags) ? listing.tags : []) as string[],
  }
  const after = {
    title: edit.title ?? before.title,
    description: edit.description ?? before.description,
    tags: edit.tags ?? before.tags,
  }
  const changes: Record<string, { before: unknown; after: unknown }> = {}

  if (edit.title || edit.description || edit.tags) {
    await updateShopListingText({ token, shopId, listingId: job.etsyDraftId, ...after })
    for (const field of ["title", "description", "tags"] as const) {
      if (edit[field] !== undefined) changes[field] = { before: before[field], after: after[field] }
    }
  }

  if (edit.altTexts) {
    const images = (await listListingImages(token, shopId, job.etsyDraftId)) as EtsyImage[]
    for (const { rank, altText } of edit.altTexts) {
      const image = images.find((candidate) => candidate.rank === rank)
      if (!image?.listing_image_id) throw new Error(`There is no photo at position ${rank}.`)
      await setListingImageAltText({
        token,
        shopId,
        listingId: job.etsyDraftId,
        listingImageId: image.listing_image_id,
        rank,
        altText,
      })
      changes[`altText:${rank}`] = { before: image.alt_text || null, after: altText }
    }
  }

  if (edit.attributes) {
    const editable = await getEditableAttributes(token, Number(listing?.taxonomy_id), job.productType)
    const current = await getListingProperties(token, shopId, job.etsyDraftId).catch(() => [])
    const norm = (value: string) => value.trim().toLowerCase()
    for (const attribute of edit.attributes) {
      const property = editable.find((candidate) => norm(candidate.name) === norm(attribute.name))
      if (!property) {
        throw new Error(`"${attribute.name}" is not an editable attribute here. Editable: ${editable.map((item) => item.name).join(", ")}.`)
      }
      if (attribute.values.length > property.maxValues) {
        throw new Error(`"${property.name}" accepts at most ${property.maxValues} value(s).`)
      }
      const before = (current as Array<{ property_id?: number; values?: string[] }>).find((item) => Number(item.property_id) === property.propertyId)
      if (attribute.values.length === 0) {
        await deleteListingProperty({ token, shopId, listingId: job.etsyDraftId, propertyId: property.propertyId })
        changes[`attribute:${property.name}`] = { before: before?.values ?? null, after: null }
        continue
      }
      const options = attribute.values.map((name) => {
        const option = property.options.find((candidate) => norm(candidate.name) === norm(name))
        if (!option) throw new Error(`"${name}" is not a valid option for "${property.name}". Options: ${property.options.map((item) => item.name).join(", ")}.`)
        return option
      })
      await updateListingProperty({
        token,
        shopId,
        listingId: job.etsyDraftId,
        propertyId: property.propertyId,
        valueIds: options.map((option) => option.valueId),
        values: options.map((option) => option.name),
        scaleId: null,
      })
      changes[`attribute:${property.name}`] = { before: before?.values ?? null, after: options.map((option) => option.name) }
    }
  }

  repository.recordJobEvent(job.id, "CLAUDE_EDIT", `Claude edited ${Object.keys(changes).join(", ")}: ${edit.reason}`, {
    reason: edit.reason,
    changes,
  })
  return { productCode, changed: Object.keys(changes), changes }
}
