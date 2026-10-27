// A pending policy is deliberately not a license to persist provider output.
export const providerPolicies = Object.freeze({
  alura: { status: "VERIFIED", storeEvidence: true, evidenceHours: 23, cacheHours: 1, retainOriginalKnowledge: true,
    source: "https://docs.alura.io/legal/api-terms", maintenance: true },
  etsy: { status: "VERIFIED_FRESHNESS", storeEvidence: true, evidenceHours: 6, cacheHours: 1, retainOriginalKnowledge: false,
    source: "https://www.etsy.com/legal/api/", maintenance: true },
  everbee: { status: "PENDING", storeEvidence: false, evidenceHours: null, cacheHours: null, retainOriginalKnowledge: false,
    source: "https://www.everbee.io/legal/terms-of-service", maintenance: false },
  google_trends: { status: "PENDING", storeEvidence: false, evidenceHours: null, cacheHours: null, retainOriginalKnowledge: false,
    source: "https://developers.google.com/search/apis/trends", maintenance: false },
  web: { status: "PENDING", storeEvidence: false, evidenceHours: null, cacheHours: null, retainOriginalKnowledge: false,
    source: null, maintenance: false },
  marketplace_insights: { status: "OWNER_DATA", storeEvidence: true, evidenceHours: null, cacheHours: 1, retainOriginalKnowledge: true,
    source: null, maintenance: false },
})

export function getProviderPolicy(provider) {
  const policy = providerPolicies[provider]
  if (!policy) throw new Error(`Unknown research provider: ${provider}`)
  return policy
}

export function providerExpiry(provider, capturedAt = new Date()) {
  const policy = getProviderPolicy(provider)
  if (!policy.storeEvidence) throw new Error(`Storage policy pending for ${provider}.`)
  return policy.evidenceHours === null ? null : new Date(capturedAt.getTime() + policy.evidenceHours * 3600000).toISOString()
}
