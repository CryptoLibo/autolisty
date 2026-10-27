import OpenAI from "openai"
import type { MarketCapability, MarketConnector, MarketQuery } from "./contracts"
import { estimatePromptTokens } from "../tokenEstimate"

export type MarketPlan = { objective: string; terms: string[]; queries: Array<{ provider: string; query: MarketQuery }>;
  missing: string[]; model: string | null; usage: { inputTokens: number; outputTokens: number } | null }
export type Planner = (request: string, connectors: MarketConnector[]) => Promise<MarketPlan>

const schema = { type: "object", additionalProperties: false, required: ["objective", "terms", "capabilities"],
  properties: { objective: { type: "string" }, terms: { type: "array", items: { type: "string" } },
    capabilities: { type: "array", items: { type: "string", enum: ["keywords", "products", "shops", "trending"] } } } } as const

export const openAiMarketPlanner: Planner = async (request, connectors) => {
  const allowed = connectors.flatMap((connector) => connector.status().state === "AVAILABLE"
    ? connector.status().capabilities.map((capability) => ({ provider: connector.provider, capability })) : [])
  if (!allowed.length) return { objective: request, terms: [], queries: [], missing: ["No authorized research connector is available."], model: null, usage: null }
  const model = "gpt-5.4-mini"
  const maxOutputTokens = 400
  const budget = Number(process.env.MARKET_RESEARCH_MAX_AI_TOKENS || "2500")
  if (!Number.isInteger(budget) || budget < 500 || budget > 10000) throw new Error("Invalid market AI token budget.")
  if (estimatePromptTokens(request + JSON.stringify(allowed)) + maxOutputTokens + 300 > budget) {
    throw new Error("Research plan exceeds the estimated AI token budget.")
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const response = await client.responses.create({ model, temperature: 0, max_output_tokens: maxOutputTokens,
    text: { format: { type: "json_schema", name: "market_research_plan", strict: true, schema } },
    input: [{ role: "system", content: [{ type: "input_text", text:
      "Interpret the owner's market research request. Return at most three precise Etsy search terms and the minimal capabilities needed. For open discovery without a niche, return no invented niche; use products only when a real search term is present. Never claim external evidence. Available capabilities: " + JSON.stringify(allowed) }] },
    { role: "user", content: [{ type: "input_text", text: request }] }],
  })
  const parsed = JSON.parse(response.output_text || "{}") as { objective?: string; terms?: string[]; capabilities?: MarketCapability[] }
  const terms = [...new Set((parsed.terms || []).map((term) => term.trim()).filter((term) => term.length > 1 && term.length <= 120))].slice(0, 3)
  const capabilities = [...new Set(parsed.capabilities || [])].filter((capability) => allowed.some((item) => item.capability === capability))
  const queries: MarketPlan["queries"] = terms.flatMap((term) => capabilities.filter((capability) => capability !== "trending").flatMap((capability) => allowed.filter((item) => item.capability === capability)
    .map((item) => ({ provider: item.provider, query: { capability, term, limit: 10 } }))))
    .slice(0, 6)
  if (!terms.length && capabilities.includes("trending")) {
    const provider = allowed.find((item) => item.capability === "trending")
    if (provider && queries.length < 6) queries.push({ provider: provider.provider, query: { capability: "trending", term: "", limit: 10 } })
  }
  return { objective: (parsed.objective || request).slice(0, 500), terms, queries,
    missing: !terms.length && !queries.length ? ["No specific niche or keyword was identified; broad discovery needs an authorized trending capability."] : [],
    model, usage: { inputTokens: response.usage?.input_tokens || 0, outputTokens: response.usage?.output_tokens || 0 } }
}
