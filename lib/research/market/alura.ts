import type { MarketConnector, MarketQuery, MarketResult, MarketMetric, ProviderStatus } from "./contracts"
import { fetchMarketPage } from "./http"

type Fetch = typeof fetch
type AluraKeyword = { id?: string; keyword?: string; as_of?: string; volume?: { etsy_monthly?: number | null };
  competition?: { competing_listings?: number | null }; trend?: { change_3m?: number | null; change_yoy?: number | null } }
type AluraProduct = { id?: string; title?: string; as_of?: string; sales?: { est_monthly_avg?: number | null; est_last_month?: number | null; est_trend_3m?: number | null };
  price?: { usd?: string | null } }

function number(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null }

export class AluraConnector implements MarketConnector {
  readonly provider = "alura" as const
  constructor(private readonly key: string | undefined, private readonly enabled: boolean, private readonly fetcher: Fetch = fetch) {}
  status(): ProviderStatus {
    if (!this.enabled) return { provider: this.provider, state: "DISABLED", capabilities: [], reason: "Live market calls are disabled." }
    if (!this.key) return { provider: this.provider, state: "NOT_AUTHORIZED", capabilities: [], reason: "ALURA_API_KEY is not configured." }
    return { provider: this.provider, state: "AVAILABLE", capabilities: ["keywords", "products", "trending" ] }
  }
  estimate(query: MarketQuery) { return query.capability === "keywords" ? 1 : ["products", "trending"].includes(query.capability) ? 10 : null }

  async query(query: MarketQuery): Promise<MarketResult> {
    if (this.status().state !== "AVAILABLE") throw new Error("Alura is unavailable.")
    if (!["keywords", "products", "trending"].includes(query.capability) ||
      (query.capability !== "trending" && !query.term.trim()) || query.term.length > 120 || query.limit < 1 || query.limit > 25) {
      throw new Error("Unsupported Alura market query.")
    }
    const url = new URL(query.capability === "keywords" ? "https://api.alura.io/v1/research/keywords" :
      query.capability === "trending" ? "https://api.alura.io/v1/research/products/trending" : "https://api.alura.io/v1/research/products")
    if (query.capability !== "trending") url.searchParams.set("q", query.term)
    if (query.capability === "keywords") url.searchParams.set("language", "en")
    if (query.capability === "trending") url.searchParams.set("type", "rising")
    if (query.capability !== "keywords") {
      url.searchParams.set("limit", String(query.limit))
      if (query.cursor) url.searchParams.set("cursor", query.cursor)
    }
    const response = await fetchMarketPage(url, { Authorization: `Bearer ${this.key}` }, this.fetcher)
    if (!response.ok) throw new Error(`Alura request failed (${response.status}).`)
    const body = await response.json() as { data?: unknown[]; next_cursor?: string | null; pending?: string[]; unfetched?: unknown[];
      summary?: { trend_window?: { from?: string; to?: string } } }
    if (!Array.isArray(body.data)) throw new Error("Alura response has no data array.")
    const now = new Date().toISOString()
    const metrics: MarketMetric[] = []
    const add = (sourceId: string, sourceUrl: string, period: string, metric: string, unit: string, value: unknown,
      nature: MarketMetric["nature"], subject: string, uncertainty?: string) => {
      const parsed = number(value)
      if (parsed !== null) metrics.push({ provider: "alura", sourceId, sourceUrl, capturedAt: now, period,
        metric, unit, value: parsed, nature, subject, uncertainty })
    }
    if (query.capability === "keywords") {
      for (const item of body.data.slice(0, query.limit) as AluraKeyword[]) {
        if (!item.id || !item.keyword) continue
        const url = `https://api.alura.io/v1/research/keywords/${encodeURIComponent(item.id)}`
        const period = item.as_of || now
        add(item.id, url, period, "etsy_monthly_searches", "searches/month", item.volume?.etsy_monthly, "estimated", item.keyword, "Alura keyword estimate; not Etsy verified sales.")
        add(item.id, url, period, "competing_listings", "listings", item.competition?.competing_listings,
          "observed", item.keyword, "Alura snapshot of competing listings; not Etsy-verified sales.")
        add(item.id, url, period, "etsy_search_change_3m", "fraction", item.trend?.change_3m, "estimated", item.keyword)
        add(item.id, url, period, "etsy_search_change_yoy", "fraction", item.trend?.change_yoy, "estimated", item.keyword)
      }
    } else {
      for (const item of body.data.slice(0, query.limit) as AluraProduct[]) {
        if (!item.id) continue
        const url = `https://www.etsy.com/listing/${encodeURIComponent(item.id)}`
        const period = query.capability === "trending" && body.summary?.trend_window?.from && body.summary.trend_window.to
          ? `${body.summary.trend_window.from}..${body.summary.trend_window.to}` : item.as_of || now
        const subject = query.capability === "trending" ? item.title || `Trending listing ${item.id}` : query.term
        add(item.id, url, period, "estimated_monthly_sales_lifetime_average", "sales/month", item.sales?.est_monthly_avg,
          "estimated", subject, "Lifetime average; not recent verified Etsy sales.")
        add(item.id, url, period, "estimated_last_month_sales", "sales/month", item.sales?.est_last_month,
          "estimated", subject, "Alura estimate; may be unavailable.")
        add(item.id, url, period, "estimated_sales_trend_3m", "fraction", item.sales?.est_trend_3m,
          "estimated", subject)
        const price = item.price?.usd == null ? null : Number(item.price.usd)
        add(item.id, url, period, "listing_price", "USD", price, "observed", subject)
      }
    }
    const reported = response.headers.get("Alura-Credits-Cost")
    return { metrics, nextCursor: body.next_cursor || undefined,
      creditsReported: reported && Number.isFinite(Number(reported)) ? Number(reported) : undefined,
      warnings: [...(body.pending?.length ? [`${body.pending.length} keywords pending at Alura.`] : []),
        ...(body.unfetched?.length ? [`${body.unfetched.length} keywords unavailable at Alura.`] : [])] }
  }
}
