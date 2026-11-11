// Regenera el PDF de entrega (enlaces firmados) de los listings ya creados y lo
// sustituye en Etsy. Se usa una vez al activar la firma de enlaces.
import { getPrimaryShop } from "../etsy/listings"
import { syncDraftFile } from "../etsy/draftSync"
import { getFreshToken } from "../integrations/tokenSession"
import { getProductOption } from "../products"
import { generateDeliveryPdf } from "../r2/generateDeliveryPdf"
import { uploadDeliveryPdf } from "../r2/uploadDeliveryPdf"
import { AutomationRepository } from "./repository"

export async function regenerateDeliveryPdfs() {
  const token = await getFreshToken("etsy")
  if (!token) throw new Error("Etsy is not connected.")
  const shopId = Number((await getPrimaryShop(token)).shop_id)
  const repository = new AutomationRepository()
  const jobs = repository
    .listJobs(1000)
    .filter((job) => job.etsyDraftId && job.deliveryUrl && getProductOption(job.productType).delivery.mode !== "direct")

  const results: Array<{ productCode: string; ok: boolean; error?: string }> = []
  for (const job of jobs) {
    try {
      const bytes = await generateDeliveryPdf(job.productType, job.productCode)
      const upload = await uploadDeliveryPdf({ fileBuffer: Buffer.from(bytes), filename: `${job.productCode}.pdf` })
      await syncDraftFile(
        { token, shopId, listingId: String(job.etsyDraftId) },
        { url: upload.url, filename: `${job.productCode}.pdf` }
      )
      repository.recordJobEvent(job.id, "DELIVERY_PDF_REGENERATED", "PDF de entrega regenerado con enlaces firmados.")
      results.push({ productCode: job.productCode, ok: true })
    } catch (error) {
      results.push({ productCode: job.productCode, ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return results
}
