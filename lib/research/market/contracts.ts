export type MarketProvider = "alura" | "everbee" | "etsy" | "google_trends" | "web" | "marketplace_insights"
export type MarketCapability = "keywords" | "products" | "shops" | "trending" | "manual"
export type ConnectionState = "AVAILABLE" | "UNAVAILABLE" | "NOT_AUTHORIZED" | "DISABLED"

export type ProviderStatus = { provider: MarketProvider; state: ConnectionState; capabilities: MarketCapability[]; reason?: string }
export type MarketQuery = { capability: MarketCapability; term: string; limit: number; cursor?: string }
export type MarketMetric = {
  provider: MarketProvider
  sourceId: string
  sourceUrl: string
  capturedAt: string
  period: string
  metric: string
  unit: string
  value: number
  nature: "observed" | "estimated" | "inferred"
  uncertainty?: string
  subject: string
}
export type MarketResult = { metrics: MarketMetric[]; nextCursor?: string; creditsReported?: number; warnings: string[] }
export interface MarketConnector {
  readonly provider: MarketProvider
  status(): ProviderStatus
  estimate(query: MarketQuery): number | null
  query(query: MarketQuery): Promise<MarketResult>
}
