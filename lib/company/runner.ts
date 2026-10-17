import OpenAI from "openai"
import { MODEL_PRICING_USD_PER_MILLION, type AgentId } from "./agents"
import { estimateActualUsd, MAX_WEB_SEARCH_CALLS, reserveEstimateUsd } from "./budget"
import { CompanyRepository } from "./repository"

type Source = { title: string; url: string }

function sourcesFromResponse(response: OpenAI.Responses.Response): Source[] {
  const sources = new Map<string, Source>()
  for (const item of response.output) {
    if (item.type !== "message") continue
    for (const part of item.content) {
      if (part.type !== "output_text") continue
      for (const annotation of part.annotations || []) {
        if (annotation.type === "url_citation" && annotation.url?.startsWith("https://")) {
          sources.set(annotation.url, { title: annotation.title || annotation.url, url: annotation.url })
        }
      }
    }
  }
  return [...sources.values()]
}

async function paidResponse(
  repository: CompanyRepository,
  taskId: string,
  agentId: AgentId,
  input: string,
  withWebSearch: boolean,
  structured: boolean
) {
  const agent = repository.agentConfig(agentId)
  if (!(agent.model in MODEL_PRICING_USD_PER_MILLION)) throw new Error(`No verified pricing for model ${agent.model}.`)
  const model = agent.model as ReturnType<typeof import("./agents").modelFor>
  if (withWebSearch && !agent.tools.includes("web_search")) throw new Error(`${agentId} is not permitted to use web search.`)
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.")
  const reservation = reserveEstimateUsd(model, withWebSearch)
  const callId = repository.reserveCall(taskId, agentId, model, reservation)
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const response = await client.responses.create({
      model,
      instructions: `Your persistent company display name is ${agent.name}. Your stable role and responsibilities do not change when this name changes.\n${agent.instructions}`,
      input,
      max_output_tokens: withWebSearch ? 2500 : 1600,
      ...(withWebSearch ? { tools: [{ type: "web_search" as const, search_context_size: "low" as const }], tool_choice: "required" as const, max_tool_calls: MAX_WEB_SEARCH_CALLS } : {}),
      ...(structured ? { text: { format: { type: "json_schema" as const, name: "ceo_decision", strict: true, schema: {
        type: "object", additionalProperties: false, required: ["action", "answer", "research_question"],
        properties: { action: { type: "string", enum: ["answer", "delegate_research"] }, answer: { type: "string" }, research_question: { type: "string" } },
      } } } } : {}),
    })
    if (response.status !== "completed") throw new Error(`Model response status: ${response.status}`)
    const inputTokens = response.usage?.input_tokens || 0
    const cachedTokens = response.usage?.input_tokens_details?.cached_tokens || 0
    const outputTokens = response.usage?.output_tokens || 0
    const webCalls = response.output.filter((item) => item.type === "web_search_call").length
    const cost = estimateActualUsd(inputTokens, cachedTokens, outputTokens, webCalls, model)
    repository.finishCall(callId, { ...cost, inputTokens, cachedTokens, outputTokens, webCalls, responseId: response.id })
    return { text: response.output_text, sources: sourcesFromResponse(response), webCalls }
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : null
    const safeError = status === 401 ? "OpenAI authentication failed (401). Replace the configured API key." :
      status === 403 ? "OpenAI denied access (403). Check project permissions." :
      status === 429 ? "OpenAI rate limit or quota reached (429)." :
      error instanceof Error && error.name === "APIConnectionError" ? "Connection to OpenAI failed; billing status is uncertain." :
      "OpenAI call failed; review provider logs before retry."
    repository.failCall(callId, safeError, status === 401)
    throw new Error(safeError)
  }
}

function contextFor(repository: CompanyRepository, conversationId: string) {
  const context = repository.recentContext(conversationId)
  return JSON.stringify({
    conversation: context.messages.map(({ role, content }) => ({ role, content: content.slice(0, 5000) })),
    previousResearch: (context.reports as Array<{ content: string; sources_json: string; created_at: string }>).map((r) => ({
      date: r.created_at, summary: r.content.slice(0, 11000), sources: JSON.parse(r.sources_json),
    })),
  })
}

export async function runCompanyStage(repository: CompanyRepository, taskId: string) {
  const task = repository.task(taskId)
  if (!task) throw new Error("Task not found.")
  if (task.status === "COMPLETED" || task.status === "NEEDS_REVIEW") return task
  if (!repository.claimStage(taskId, task.stage)) return repository.task(taskId)

  try {
    if (task.stage === "CEO_DECIDE") {
      const result = await paidResponse(repository, taskId, "ceo", `Decide how to respond to the owner's latest message. Use existing research if sufficiently current and relevant. Delegate only if new external evidence is genuinely required. A discussion or question does not authorize production. Return answer in Spanish if action is answer.\nContext: ${contextFor(repository, task.conversation_id)}`, false, true)
      const decision = JSON.parse(result.text) as { action: string; answer: string; research_question: string }
      if (decision.action === "delegate_research") {
        if (!decision.research_question.trim()) throw new Error("CEO delegated without a research question.")
        repository.stage(taskId, "RESEARCH", "RESEARCH_READY", { researchQuestion: decision.research_question.trim() })
      } else if (decision.action === "answer") {
        repository.complete(taskId, decision.answer)
      } else throw new Error("Unknown CEO decision.")
    } else if (task.stage === "RESEARCH") {
      if (task.research_question && repository.reuseRecentReport(taskId, task.research_question)) return repository.task(taskId)
      const result = await paidResponse(repository, taskId, "market_researcher", `Research question: ${task.research_question}. Use real sources and provide dated evidence, limits and URLs. Do not invent sales figures.`, true, false)
      if (result.webCalls === 0 || result.sources.length === 0) throw new Error("Research lacked a web search or verifiable cited source.")
      repository.saveReport(taskId, result.text, result.sources)
    } else if (task.stage === "CEO_SYNTHESIZE") {
      const report = repository.report(taskId)
      if (!report) throw new Error("Research report missing.")
      const result = await paidResponse(repository, taskId, "ceo", `Answer the owner naturally in Spanish. Base claims on this research, cite relevant URLs and explain uncertainty. Do not start production.\nOriginal context: ${contextFor(repository, task.conversation_id)}\nCurrent research: ${report.content}\nVerified source URLs: ${report.sources_json}`, false, false)
      repository.complete(taskId, result.text)
    } else throw new Error(`Unknown task stage: ${task.stage}`)
  } catch (error) {
    repository.failTask(taskId, error instanceof Error ? error.message : String(error))
  }
  return repository.task(taskId)
}
