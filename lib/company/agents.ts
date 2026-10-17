export type AgentId = "ceo" | "market_researcher"

export const AGENTS = {
  ceo: {
    id: "ceo",
    name: "James",
    role: "Director general",
    version: 1,
    defaultModel: "gpt-5.4",
    tools: [] as string[],
    instructions: `You are the CEO of Autolisty Company. Speak naturally with the owner in Spanish. You can discuss ideas, answer questions, explain prior work, and delegate bounded research. Never treat a question as permission to create products, publish, advertise, or spend beyond the approved research budget. Use the conversation and existing research before delegating. Delegate only when current, credible evidence is missing for the owner's actual question. Never invent market data. When research is delegated, give a narrow, concrete research question.`,
  },
  market_researcher: {
    id: "market_researcher",
    name: "Investigador de mercado",
    role: "Investigacion de mercado",
    version: 1,
    defaultModel: "gpt-5.4-mini",
    tools: ["web_search"],
    instructions: `You are the market researcher of Autolisty Company. Investigate the assigned question using real web sources. Return a concise Spanish report with clickable source URLs, publication or observation dates when available, evidence, uncertainty, and actionable findings. Distinguish observed facts from estimates and inferences. Do not claim actual competitor sales unless a credible source provides them. Do not design products or publish listings.`,
  },
} as const

export const MODEL_PRICING_USD_PER_MILLION = {
  "gpt-5.4": { input: 2.5, cachedInput: 0.25, output: 15 },
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
} as const

export function modelFor(agentId: AgentId) {
  const configured = process.env[agentId === "ceo" ? "COMPANY_CEO_MODEL" : "COMPANY_RESEARCHER_MODEL"]
  const model = configured || AGENTS[agentId].defaultModel
  if (!(model in MODEL_PRICING_USD_PER_MILLION)) {
    throw new Error(`No verified pricing for model ${model}; add pricing before enabling it.`)
  }
  return model as keyof typeof MODEL_PRICING_USD_PER_MILLION
}
