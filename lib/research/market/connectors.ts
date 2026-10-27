import { AluraConnector } from "./alura"
import { EverBeeConnector } from "./everbee"
import { EtsyMarketConnector } from "./etsy"
import type { MarketConnector, MarketProvider, ProviderStatus } from "./contracts"

export function marketConnectors(options: { liveEnabled?: boolean } = {}) {
  const liveEnabled = options.liveEnabled ?? process.env.MARKET_RESEARCH_LIVE_ENABLED === "true"
  return [new AluraConnector(process.env.ALURA_API_KEY, liveEnabled),
    new EverBeeConnector(process.env.EVERBEE_CLIENT_ID, process.env.EVERBEE_CLIENT_SECRET, liveEnabled,
      process.env.EVERBEE_INSTALLATION_APPROVED === "true"),
    new EtsyMarketConnector(process.env.ETSY_API_KEY && process.env.ETSY_SHARED_SECRET
      ? `${process.env.ETSY_API_KEY}:${process.env.ETSY_SHARED_SECRET}` : undefined, liveEnabled)] satisfies MarketConnector[]
}

export function marketStatuses(connectors: MarketConnector[]): ProviderStatus[] {
  const statuses = connectors.map((connector) => connector.status())
  const blocked: Array<[MarketProvider, string]> = [
    ["google_trends", "Official API is an access-controlled alpha."],
    ["web", "No configured authorized search provider."],
  ]
  return [...statuses, ...blocked.map(([provider, reason]) => ({ provider, state: "UNAVAILABLE" as const, capabilities: [], reason })),
    { provider: "marketplace_insights", state: "AVAILABLE", capabilities: ["manual"] }]
}
