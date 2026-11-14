// Publicar un draft desde Claude (MCP). Por ahora solo con la aprobación explícita del
// propietario en el chat; la revisión diaria solo podrá publicar cuando él lo active
// (ajuste review.allow_publish = "on").
import { getFreshToken } from "../integrations/tokenSession"
import { activateListing, getPrimaryShop, getShopListing } from "../etsy/listings"
import { notifyOwner } from "../notifications/webPush"
import { AutomationRepository } from "./repository"
import { getAutomationDatabase } from "./db/database"

export function scheduledPublishAllowed() {
  const row = getAutomationDatabase()
    .prepare("SELECT setting_value FROM automation_settings WHERE setting_key = 'review.allow_publish'")
    .get() as { setting_value: string } | undefined
  return row?.setting_value === "on"
}

export async function publishListingDraft(input: { productCode?: unknown; ownerApproved?: unknown; scheduledReview?: unknown; reason?: unknown }) {
  const productCode = typeof input.productCode === "string" ? input.productCode.trim() : ""
  if (!/^LBCreaStudio-[A-Z0-9]{6}$/.test(productCode)) throw new Error('productCode must look like "LBCreaStudio-ABC123".')
  const scheduled = input.scheduledReview === true
  if (scheduled && !scheduledPublishAllowed()) {
    throw new Error("Publishing from the scheduled review is not enabled yet; leave the draft for the owner.")
  }
  if (!scheduled && input.ownerApproved !== true) {
    throw new Error("Publishing needs the owner's explicit approval in this conversation (ownerApproved=true).")
  }
  const repository = new AutomationRepository()
  const job = repository.getJobByProductCode(productCode)
  if (!job?.etsyDraftId) throw new Error(`No Etsy draft for ${productCode}.`)
  if (job.status !== "WAITING_ETSY_REVIEW") throw new Error(`${productCode} is not waiting for review (status ${job.status}).`)

  const token = await getFreshToken("etsy")
  if (!token) throw new Error("Etsy is not connected in Autolisty.")
  const shopId = Number((await getPrimaryShop(token)).shop_id)
  const listing = await getShopListing(token, shopId, job.etsyDraftId) as { state?: string }
  if (String(listing?.state || "") !== "draft") throw new Error(`${productCode} is "${listing?.state}" on Etsy, not a draft.`)

  const published = await activateListing(token, shopId, job.etsyDraftId)
  const reason = typeof input.reason === "string" ? input.reason.slice(0, 300) : ""
  repository.recordJobEvent(job.id, "CLAUDE_PUBLISH", `${scheduled ? "[revisión diaria] " : ""}Claude publicó el listing${reason ? `: ${reason}` : "."}`)
  // El worker detecta la publicación en su próximo paso (estado, URL y pines de Pinterest).
  repository.checkReviewNow()
  await notifyOwner({
    title: `Claude publicó ${productCode}`,
    body: reason || "Publicado en Etsy tras la revisión.",
    url: published.url || "/automation",
    tag: `claude-publish-${productCode}`,
  }).catch(() => {})
  return { productCode, state: published.state ?? "active", url: published.url ?? null }
}
