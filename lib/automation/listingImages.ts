// Fotos de un listing de Etsy como imágenes para Claude (revisión diaria): así puede ver
// colores, sujeto y mockups antes de corregir atributos o alt texts.
import { getFreshToken } from "../integrations/tokenSession"
import { getPrimaryShop, listListingImages } from "../etsy/listings"
import { fetchAllowed, isEtsyImageUrl } from "../http/safeFetch"
import { AutomationRepository } from "./repository"

type EtsyImage = { rank?: number; url_570xN?: string; url_fullxfull?: string }

export async function getListingImages(input: { productCode?: unknown; ranks?: unknown }) {
  const productCode = typeof input.productCode === "string" ? input.productCode.trim() : ""
  if (!/^LBCreaStudio-[A-Z0-9]{6}$/.test(productCode)) throw new Error('productCode must look like "LBCreaStudio-ABC123".')
  const job = new AutomationRepository().getJobByProductCode(productCode)
  if (!job?.etsyDraftId) throw new Error(`${productCode} has no Etsy listing yet.`)
  const wanted = Array.isArray(input.ranks)
    ? new Set(input.ranks.map(Number).filter((rank) => Number.isInteger(rank) && rank > 0 && rank <= 20))
    : null

  const token = await getFreshToken("etsy")
  if (!token) throw new Error("Etsy is not connected in Autolisty.")
  const shopId = Number((await getPrimaryShop(token)).shop_id)
  const images = (await listListingImages(token, shopId, job.etsyDraftId) as EtsyImage[])
    .filter((image) => image.rank && (!wanted || wanted.has(image.rank)))
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .slice(0, 12)

  const result: Array<{ rank: number; mimeType: string; data: string }> = []
  for (const image of images) {
    const url = image.url_570xN || image.url_fullxfull
    if (!url) continue
    const response = await fetchAllowed(url, isEtsyImageUrl, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) continue
    const mimeType = (response.headers.get("content-type") || "image/jpeg").split(";")[0]
    result.push({ rank: image.rank!, mimeType, data: Buffer.from(await response.arrayBuffer()).toString("base64") })
  }
  return { productCode, images: result }
}
