import type { MarketConnector, MarketQuery, MarketResult, MarketMetric, ProviderStatus } from "./contracts"
import { fetchMarketPage } from "./http"

type Fetch = typeof fetch
export class EverBeeConnector implements MarketConnector {
  readonly provider = "everbee" as const
  constructor(private readonly clientId: string | undefined, private readonly clientSecret: string | undefined,
    private readonly enabled: boolean, private readonly approved: boolean, private readonly fetcher: Fetch = fetch) {}
  status(): ProviderStatus {
    if (!this.enabled) return { provider: "everbee", state: "DISABLED", capabilities: [], reason: "Live market calls are disabled." }
    if (!this.clientId || !this.clientSecret) return { provider: "everbee", state: "NOT_AUTHORIZED", capabilities: [], reason: "EverBee app credentials and approved installation are required." }
    if (!this.approved) return { provider: "everbee", state: "NOT_AUTHORIZED", capabilities: [], reason: "Approved installation has not been confirmed." }
    return { provider: "everbee", state: "AVAILABLE", capabilities: ["keywords"], reason: "Configured; approved installation and paid plan must still be confirmed by the provider." }
  }
  estimate(query: MarketQuery) { return query.capability === "keywords" ? 1 : null }
  async query(query: MarketQuery): Promise<MarketResult> {
    if (this.status().state !== "AVAILABLE") throw new Error("EverBee is unavailable.")
    if (query.capability !== "keywords" || !query.term.trim() || query.term.length > 120 || query.limit < 1 || query.limit > 20) {
      throw new Error("Unsupported EverBee query.")
    }
    const url = new URL(`https://research-open-api.everbee.com/api/v1/keywords/${encodeURIComponent(query.term)}`)
    url.searchParams.set("page", "1"); url.searchParams.set("per_page", String(query.limit))
    const response = await fetchMarketPage(url, { client_id: this.clientId!, client_secret: this.clientSecret! }, this.fetcher)
    if (!response.ok) throw new Error(`EverBee request failed (${response.status}).`)
    const body = await response.json() as { results?: Array<{ keyword?: string; vol?: number; new_volume?: number;
      competition?: number; score?: number; _id?: string }> ; total_pages?: number }
    if (!Array.isArray(body.results)) throw new Error("EverBee response has no results array.")
    const now = new Date().toISOString(), metrics: MarketMetric[] = []
    for (const item of body.results.slice(0, query.limit)) {
      if (!item.keyword) continue
      const sourceUrl = url.toString(), sourceId = item._id || item.keyword
      const add = (metric: string, unit: string, value: unknown, nature: MarketMetric["nature"]) => {
        if (typeof value === "number" && Number.isFinite(value)) metrics.push({ provider: "everbee", sourceId,
          sourceUrl, capturedAt: now, period: "Provider snapshot; exact measurement period not supplied", metric, unit,
          value, nature, subject: item.keyword!, uncertainty: "EverBee analytics; not verified Etsy sales." })
      }
      add("keyword_volume", "provider volume", item.vol, "estimated")
      add("keyword_new_volume", "provider volume", item.new_volume, "estimated")
      add("keyword_competition", "provider score", item.competition, "estimated")
      add("keyword_score", "provider score", item.score, "estimated")
    }
    return { metrics, warnings: body.total_pages && body.total_pages > 1 ? ["Only the first EverBee page was consulted."] : [] }
  }
}
