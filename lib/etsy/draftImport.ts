// Importación de drafts del pool directamente desde Etsy (sin copiar IDs a mano).
import type { EtsyTokenPayload } from "./auth"
import { etsyFetch } from "./client"

export type EtsyDraftCandidate = {
  listingId: string
  title: string
  imageUrl: string | null
  createdAt: string | null
}

/** Todos los listings en estado draft de la tienda (paginado de 100 en 100). */
export async function listShopDrafts(token: EtsyTokenPayload, shopId: number, maxItems = 1000) {
  const drafts: EtsyDraftCandidate[] = []
  for (let offset = 0; offset < maxItems; offset += 100) {
    const response = await etsyFetch(
      `/application/shops/${shopId}/listings?state=draft&limit=100&offset=${offset}&includes=Images`,
      token
    )
    if (!response.ok) throw new Error((await response.text()) || "Failed to list Etsy drafts.")
    const data = await response.json() as {
      count?: number
      results?: Array<{
        listing_id?: number
        title?: string
        created_timestamp?: number
        images?: Array<{ url_170x135?: string; url_570xN?: string }>
      }>
    }
    for (const item of data.results || []) {
      if (!item.listing_id) continue
      const image = item.images?.[0]
      drafts.push({
        listingId: String(item.listing_id),
        title: String(item.title || "").trim(),
        imageUrl: image?.url_170x135 || image?.url_570xN || null,
        createdAt: item.created_timestamp ? new Date(item.created_timestamp * 1000).toISOString() : null,
      })
    }
    if (!data.results || data.results.length < 100) break
  }
  return drafts
}

/** Agrupa por título (los drafts base duplicados comparten título) para asignarlos por lotes. */
export function groupDraftsByTitle(drafts: EtsyDraftCandidate[]) {
  const groups = new Map<string, EtsyDraftCandidate[]>()
  for (const draft of drafts) {
    const key = draft.title || "(sin título)"
    groups.set(key, [...(groups.get(key) || []), draft])
  }
  return [...groups.entries()]
    .map(([title, items]) => ({ title, imageUrl: items.find((item) => item.imageUrl)?.imageUrl ?? null, listingIds: items.map((item) => item.listingId) }))
    .sort((a, b) => b.listingIds.length - a.listingIds.length)
}
