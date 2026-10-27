import type { MarketConnector, MarketQuery, MarketResult, MarketMetric, ProviderStatus } from "./contracts"
import { fetchMarketPage } from "./http"

type Fetch = typeof fetch
export class EtsyMarketConnector implements MarketConnector {
  readonly provider = "etsy" as const
  constructor(private readonly key: string | undefined, private readonly enabled: boolean, private readonly fetcher: Fetch = fetch) {}
  status(): ProviderStatus {
    if (!this.enabled) return { provider: "etsy", state: "DISABLED", capabilities: [], reason: "Live market calls are disabled." }
    if (!this.key) return { provider: "etsy", state: "NOT_AUTHORIZED", capabilities: [], reason: "Etsy app key is missing." }
    return { provider: "etsy", state: "AVAILABLE", capabilities: ["products"], reason: "Public active listings only; no sales per listing." }
  }
  estimate(query: MarketQuery) { return query.capability === "products" ? 1 : null }
  async query(query: MarketQuery): Promise<MarketResult> {
    if (this.status().state !== "AVAILABLE") throw new Error("Etsy research is unavailable.")
    if (query.capability !== "products" || !query.term.trim() || query.term.length > 120 || query.limit < 1 || query.limit > 25) {
      throw new Error("Unsupported Etsy research query.")
    }
    const url = new URL("https://api.etsy.com/v3/application/listings/active")
    url.searchParams.set("keywords", query.term); url.searchParams.set("limit", String(query.limit)); url.searchParams.set("offset", "0")
    const response = await fetchMarketPage(url, { "x-api-key": this.key! }, this.fetcher)
    if (!response.ok) throw new Error(`Etsy research request failed (${response.status}).`)
    const body = await response.json() as { results?: Array<{ listing_id?: number; title?: string; num_favorers?: number;
      created_timestamp?: number; url?: string }> }
    if (!Array.isArray(body.results)) throw new Error("Etsy response has no results array.")
    const now = new Date().toISOString(), metrics: MarketMetric[] = []
    for (const item of body.results.slice(0, query.limit)) {
      if (!Number.isInteger(item.listing_id) || !item.listing_id || !item.title) continue
      if (typeof item.num_favorers === "number" && Number.isFinite(item.num_favorers)) metrics.push({ provider: "etsy",
        sourceId: String(item.listing_id), sourceUrl: `https://www.etsy.com/listing/${item.listing_id}`,
        capturedAt: now, period: now, metric: "listing_favorites", unit: "favorites", value: item.num_favorers,
        nature: "observed", subject: query.term, uncertainty: "Public listing snapshot; not sales or demand." })
    }
    return { metrics, warnings: ["Etsy public listing data does not provide sales by competitor listing."] }
  }
}
