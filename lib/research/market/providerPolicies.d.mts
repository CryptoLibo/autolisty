import type { MarketProvider } from "./contracts"
export type ProviderPolicy = { status: string; storeEvidence: boolean; evidenceHours: number | null;
  cacheHours: number | null; retainOriginalKnowledge: boolean; source: string | null; maintenance: boolean }
export const providerPolicies: Readonly<Record<MarketProvider, ProviderPolicy>>
export function getProviderPolicy(provider: string): ProviderPolicy
export function providerExpiry(provider: string, capturedAt?: Date): string | null
