// Arranque del worker de postproducción dentro del proceso de Next (PM2).
// Lo llama instrumentation.ts una vez al iniciar el servidor.
import crypto from "node:crypto"
import { getAutomationDatabase } from "./db/database"
import { AutomationRepository } from "./repository"
import { runPostProductionTick, type PostProductionDeps } from "./postProduction"
import { alertNewPendingDesigns } from "./ownerAlerts"
import { getFreshToken } from "../integrations/tokenSession"
import { getPrimaryShop, getShopListing } from "../etsy/listings"
import { syncDraftFile, syncDraftImages, syncDraftText, syncDraftVideo } from "../etsy/draftSync"
import { generateEtsySeo } from "../seo/etsySeo"
import { generateDeliveryPdf } from "../r2/generateDeliveryPdf"
import { uploadDeliveryPdf } from "../r2/uploadDeliveryPdf"
import { generatePinterestCopy } from "../seo/pinterestSeo"
import { findBoardByName, publishPinterestPin } from "../pinterest/publishing"
import { recordPublishedPin } from "../dashboard/pinterest-analytics"
import { etsyFetch } from "../etsy/client"
import { notifyOwner } from "../notifications/webPush"

const TICK_MS = 60_000
const LOCK_KEY = "post_production_worker_lock"
const LOCK_TTL_MS = 15 * 60_000
const INSTANCE_ID = crypto.randomUUID()

type WorkerGlobal = typeof globalThis & { __autolistyPostProductionWorker?: NodeJS.Timeout }

// Candado en la base: si algún día hay más de un proceso, solo uno trabaja.
function acquireLock() {
  const database = getAutomationDatabase()
  const now = Date.now()
  return database.transaction(() => {
    const row = database
      .prepare("SELECT setting_value FROM automation_settings WHERE setting_key = ?")
      .get(LOCK_KEY) as { setting_value: string } | undefined
    if (row) {
      const [owner, expires] = row.setting_value.split("|")
      if (owner !== INSTANCE_ID && Number(expires) > now) return false
    }
    database.prepare(`
      INSERT INTO automation_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at
    `).run(LOCK_KEY, `${INSTANCE_ID}|${now + LOCK_TTL_MS}`, new Date(now).toISOString())
    return true
  })()
}

function releaseLock() {
  getAutomationDatabase()
    .prepare("DELETE FROM automation_settings WHERE setting_key = ? AND setting_value LIKE ?")
    .run(LOCK_KEY, `${INSTANCE_ID}|%`)
}

let shopIdCache: number | null = null

export function createPostProductionDeps(): PostProductionDeps {
  const publicBase = String(process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "")
  return {
    repository: new AutomationRepository(),
    getEtsyToken: () => getFreshToken("etsy"),
    getShopId: async (token) => {
      if (!shopIdCache) shopIdCache = Number((await getPrimaryShop(token)).shop_id)
      return shopIdCache
    },
    generateSeo: generateEtsySeo,
    buildDeliveryPdf: async (productType, productCode) => {
      const bytes = await generateDeliveryPdf(productType, productCode)
      return uploadDeliveryPdf({ fileBuffer: Buffer.from(bytes), filename: `${productCode}.pdf` })
    },
    syncText: syncDraftText,
    syncImages: syncDraftImages,
    syncFile: syncDraftFile,
    syncVideo: syncDraftVideo,
    getListing: (token, shopId, listingId) => getShopListing(token, shopId, listingId),
    getListingsBatch: async (token, listingIds) => {
      const states = new Map<string, { state?: string; url?: string }>()
      for (let index = 0; index < listingIds.length; index += 100) {
        const ids = listingIds.slice(index, index + 100).join(",")
        const response = await etsyFetch(`/application/listings/batch?listing_ids=${ids}`, token)
        if (!response.ok) throw new Error(`Etsy listings batch failed (HTTP ${response.status}).`)
        const data = await response.json() as { results?: Array<{ listing_id: number; state?: string; url?: string }> }
        for (const listing of data.results || []) {
          states.set(String(listing.listing_id), { state: listing.state, url: listing.url })
        }
      }
      return states
    },
    notify: (input) => notifyOwner(input),
    publicUrl: (key) => `${publicBase}/${key}`,
    getPinterestToken: () => getFreshToken("pinterest"),
    generatePinCopy: generatePinterestCopy,
    findBoard: findBoardByName,
    publishPin: publishPinterestPin,
    recordPin: (input) => recordPublishedPin(getAutomationDatabase(), input),
  }
}

let running = false

async function tick() {
  if (running) return
  running = true
  try {
    if (!acquireLock()) return
    try {
      const results = await runPostProductionTick(createPostProductionDeps())
      for (const result of results) {
        console.log(`[post-production] ${result.productCode} → ${result.status}`)
      }
      await alertNewPendingDesigns(getAutomationDatabase(), (input) => notifyOwner(input))
    } finally {
      releaseLock()
    }
  } catch (error) {
    console.error("[post-production] tick failed:", error)
  } finally {
    running = false
  }
}

export function startPostProductionWorker() {
  const state = globalThis as WorkerGlobal
  if (state.__autolistyPostProductionWorker) return
  if (process.env.AUTOMATION_POST_PRODUCTION === "off") {
    console.log("[post-production] desactivado (AUTOMATION_POST_PRODUCTION=off)")
    return
  }
  state.__autolistyPostProductionWorker = setInterval(tick, TICK_MS)
  state.__autolistyPostProductionWorker.unref?.()
  setTimeout(tick, 15_000).unref?.()
  console.log("[post-production] worker iniciado")
}
