import { MODEL_PRICING_USD_PER_MILLION } from "./agents"

export const DEFAULT_PILOT_CAP_USD = 5
export const WEB_SEARCH_USD_PER_CALL = 0.01
export const MAX_WEB_SEARCH_CALLS = 1

export function pilotCapUsd() {
  const value = Number(process.env.COMPANY_PILOT_BUDGET_USD || DEFAULT_PILOT_CAP_USD)
  if (!Number.isFinite(value) || value <= 0 || value > DEFAULT_PILOT_CAP_USD) {
    throw new Error("COMPANY_PILOT_BUDGET_USD must be greater than zero and at most 5.")
  }
  return value
}

export function reserveEstimateUsd(model: keyof typeof MODEL_PRICING_USD_PER_MILLION, web: boolean) {
  const price = MODEL_PRICING_USD_PER_MILLION[model]
  // Intentionally conservative for this small pilot; actual hosted-tool use can still exceed it.
  return (12000 * price.input + 3000 * price.output) / 1_000_000 + (web ? MAX_WEB_SEARCH_CALLS * WEB_SEARCH_USD_PER_CALL : 0)
}

export function estimateActualUsd(inputTokens: number, cachedTokens: number, outputTokens: number, webCalls: number, model: keyof typeof MODEL_PRICING_USD_PER_MILLION) {
  const price = MODEL_PRICING_USD_PER_MILLION[model]
  const modelUsd = ((Math.max(0, inputTokens - cachedTokens) * price.input) + cachedTokens * price.cachedInput + outputTokens * price.output) / 1_000_000
  const toolUsd = webCalls * WEB_SEARCH_USD_PER_CALL
  return { modelUsd, toolUsd, totalUsd: modelUsd + toolUsd }
}
