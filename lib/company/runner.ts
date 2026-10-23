import OpenAI from "openai"
import { MODEL_PRICING_USD_PER_MILLION, type AgentId } from "./agents"
import { estimateActualUsd, MAX_WEB_SEARCH_CALLS, reserveEstimateUsd } from "./budget"
import { CompanyRepository } from "./repository"
import { designConceptsText, reviewDesignConcepts, type DesignConcept } from "./design-quality"
import { DESIGN_PLAYBOOK, DESIGN_PLAYBOOK_VERSION } from "./design-playbook"
import { aluraCreditsRemaining, searchAluraProducts } from "./alura"
import { kittlOptions, PILOT_KITTL_MODEL, startKittlGeneration } from "./kittl-generation"
import { AGENT_PROCEDURES, CONSULTABLE_AGENT_IDS, isConsultableAgent } from "./procedures"

type Source = { title: string; url: string }
type ResponseFormat = "ceo_decision" | "product_brief" | "design_concepts" | "kittl_selection" | null

const RESPONSE_SCHEMAS = {
  ceo_decision: {
    type: "object", additionalProperties: false, required: ["action", "answer", "research_question", "design_brief", "specialist_agent_id", "specialist_question"],
    properties: {
      action: { type: "string", enum: ["answer", "delegate_research", "delegate_design", "delegate_research_design", "delegate_research_design_image", "delegate_design_image", "delegate_specialist"] },
      answer: { type: "string" }, research_question: { type: "string" }, design_brief: { type: "string" },
      specialist_agent_id: { type: "string", enum: ["", ...CONSULTABLE_AGENT_IDS] }, specialist_question: { type: "string" },
    },
  },
  product_brief: {
    type: "object", additionalProperties: false,
    required: ["product", "audience", "use", "deliverables", "constraints", "assumptions"],
    properties: {
      product: { type: "string" }, audience: { type: "string" }, use: { type: "string" },
      deliverables: { type: "array", items: { type: "string" } },
      constraints: { type: "array", items: { type: "string" } },
      assumptions: { type: "array", items: { type: "string" } },
    },
  },
  design_concepts: {
    type: "object", additionalProperties: false, required: ["concepts"],
    properties: { concepts: { type: "array", items: { type: "object", additionalProperties: false,
      required: ["name", "visual_idea", "prompt", "rationale", "text_mode", "exact_text", "typography", "hierarchy"],
      properties: { name: { type: "string" }, visual_idea: { type: "string" }, prompt: { type: "string" }, rationale: { type: "string" },
        text_mode: { type: "string", enum: ["none", "included"] }, exact_text: { type: "string" }, typography: { type: "string" }, hierarchy: { type: "string" } },
    } } },
  },
  kittl_selection: {
    type: "object", additionalProperties: false, required: ["concept_index", "model_id", "aspect_ratio", "reason"],
    properties: { concept_index: { type: "integer" }, model_id: { type: "string" }, aspect_ratio: { type: "string", enum: ["1:1", "3:4", "4:3", "9:16", "16:9"] }, reason: { type: "string" } },
  },
} as const

function productBriefText(raw: string) {
  const brief = JSON.parse(raw) as { product: string; audience: string; use: string; deliverables: string[]; constraints: string[]; assumptions: string[] }
  return `Producto: ${brief.product}\nPúblico: ${brief.audience}\nUso: ${brief.use}\nEntregables: ${brief.deliverables.join("; ")}\nRestricciones creativas: ${brief.constraints.join("; ")}\nSupuestos sin validar: ${brief.assumptions.join("; ") || "Ninguno"}`
}

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
  formatName: ResponseFormat,
  maxOutputTokens?: number
) {
  const agent = repository.agentConfig(agentId)
  if (!(agent.model in MODEL_PRICING_USD_PER_MILLION)) throw new Error(`No verified pricing for model ${agent.model}.`)
  const model = agent.model as ReturnType<typeof import("./agents").modelFor>
  if (withWebSearch && !agent.tools.includes("web_search")) throw new Error(`${agentId} is not permitted to use web search.`)
  if (withWebSearch && process.env.COMPANY_DISABLE_WEB_SEARCH === "1") throw new Error("Web search is disabled for this run.")
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.")
  const reservation = reserveEstimateUsd(model, withWebSearch)
  const callId = repository.reserveCall(taskId, agentId, model, reservation)
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const format = formatName ? { type: "json_schema" as const, name: formatName, strict: true, schema: RESPONSE_SCHEMAS[formatName] } : null
    const response = await client.responses.create({
      model,
      instructions: `Your persistent company display name is ${agent.name}. Your stable role and responsibilities do not change when this name changes.\n${agent.instructions}`,
      input,
      max_output_tokens: maxOutputTokens || (withWebSearch ? 2500 : agentId === "product_planner" ? 1000 : 1600),
      ...(withWebSearch ? { tools: [{ type: "web_search" as const, search_context_size: "low" as const }], tool_choice: "required" as const, max_tool_calls: MAX_WEB_SEARCH_CALLS } : {}),
      ...(format ? { text: { format } } : {}),
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
    previousDesign: (context.artifacts as Array<{ kind: string; content: string; created_at: string }>).map((a) => ({
      kind: a.kind, date: a.created_at, summary: a.content.slice(0, 5000),
    })),
  })
}

function specialistContext(repository: CompanyRepository, conversationId: string, agentId: string) {
  const recent = repository.recentContext(conversationId)
  const context: Record<string, unknown> = {
    messages: recent.messages.slice(-4).map(({ role, content }) => ({ role, content: content.slice(0, 1200) })),
    research: (recent.reports as Array<{ content: string; sources_json: string; created_at: string }>).slice(0, 1).map((report) => ({
      date: report.created_at, content: report.content.slice(0, 3000), sources: JSON.parse(report.sources_json),
    })),
    artifacts: (recent.artifacts as Array<{ kind: string; content: string }>).slice(0, 2).map((artifact) => ({
      kind: artifact.kind, content: artifact.content.slice(0, 2000),
    })),
  }
  if (["production_lead", "commerce_lead", "marketing_lead", "pinterest_specialist", "finance_lead", "systems_lead"].includes(agentId)) {
    const overview = repository.overview()
    context.company = { counts: overview.counts, projects: overview.projects.slice(0, 5), listings: overview.listings.slice(0, 5) }
  }
  if (agentId === "finance_lead") context.pilotSpend = repository.spend()
  return JSON.stringify(context)
}

export async function runCompanyStage(repository: CompanyRepository, taskId: string) {
  const task = repository.task(taskId)
  if (!task) throw new Error("Task not found.")
  if (task.status === "COMPLETED" || task.status === "NEEDS_REVIEW") return task
  if (!repository.claimStage(taskId, task.stage)) return repository.task(taskId)

  try {
    if (task.stage === "CEO_DECIDE") {
      const result = await paidResponse(repository, taskId, "ceo", `Decide how to respond to the owner's latest message. Use existing research if current and relevant. If asked for product/design ideas, delegate design. If the owner explicitly asks for a finished image or says to create/generate the design in Kittl, use delegate_research_design_image when market evidence is needed or delegate_design_image when it is not. These image actions authorize exactly one Kittl image for owner review, never a listing or publication. Research first only if current external evidence is needed; never search when the owner forbids it. For Alura, research_question should be a short Etsy search phrase, not a sentence. For a concrete question belonging to another department, delegate one bounded consultation to the appropriate specialist: ${CONSULTABLE_AGENT_IDS.join(", ")}. Do not delegate a trivial question. If asked only to discuss or explain, answer without delegation. For design, provide a bounded brief carrying owner constraints. Leave unused fields empty. Return answer in Spanish if action is answer.\nContext: ${contextFor(repository, task.conversation_id)}`, false, "ceo_decision")
      const decision = JSON.parse(result.text) as { action: string; answer: string; research_question: string; design_brief: string; specialist_agent_id: string; specialist_question: string }
      if (["delegate_research", "delegate_research_design", "delegate_research_design_image"].includes(decision.action)) {
        if (!decision.research_question.trim()) throw new Error("CEO delegated without a research question.")
        if (decision.action !== "delegate_research" && !decision.design_brief.trim()) throw new Error("CEO delegated design without a brief.")
        repository.stage(taskId, "RESEARCH", "RESEARCH_READY", {
          researchQuestion: decision.research_question.trim(),
          ...(decision.action !== "delegate_research" ? { designBrief: decision.design_brief.trim() } : {}),
          imageRequested: decision.action === "delegate_research_design_image",
        })
      } else if (decision.action === "delegate_design" || decision.action === "delegate_design_image") {
        if (!decision.design_brief.trim()) throw new Error("CEO delegated design without a brief.")
        repository.stage(taskId, "PRODUCT_PLAN", "DESIGN_READY", { designBrief: decision.design_brief.trim(), imageRequested: decision.action === "delegate_design_image" })
      } else if (decision.action === "delegate_specialist") {
        if (!isConsultableAgent(decision.specialist_agent_id) || !decision.specialist_question.trim()) {
          throw new Error("CEO delegated without a valid specialist and bounded question.")
        }
        repository.stage(taskId, "SPECIALIST", "SPECIALIST_READY", {
          specialistAgentId: decision.specialist_agent_id,
          specialistQuestion: decision.specialist_question.trim().slice(0, 1500),
        })
      } else if (decision.action === "answer") {
        repository.complete(taskId, decision.answer)
      } else throw new Error("Unknown CEO decision.")
    } else if (task.stage === "RESEARCH") {
      if (task.research_question && repository.reuseRecentReport(taskId, task.research_question)) return repository.task(taskId)
      if (process.env.COMPANY_RESEARCH_PROVIDER === "alura" || !process.env.COMPANY_RESEARCH_PROVIDER && process.env.ALURA_API_KEY) {
        if (process.env.COMPANY_ALURA_RESEARCH_ENABLED === "0") throw new Error("Alura research is disabled.")
        if (!repository.agentConfig("market_researcher").tools.includes("alura_research")) throw new Error("Researcher is not permitted to use Alura.")
        if (await aluraCreditsRemaining() < 10) throw new Error("Alura no tiene 10 créditos disponibles para esta búsqueda.")
        const creditCap = Number(process.env.COMPANY_ALURA_CREDIT_CAP || 100)
        const creditReservation = repository.reserveExternalCredits(taskId, "alura", 10, creditCap)
        const research = await searchAluraProducts((task.research_question || "").slice(0, 200)).catch((error) => {
          repository.markExternalCreditsUnknown(creditReservation)
          throw error
        })
        repository.finishExternalCredits(creditReservation, research.creditsCost, research.creditsRemaining)
        repository.event(taskId, "alura_research_completed", { creditsCost: research.creditsCost, creditsRemaining: research.creditsRemaining, resultCount: research.products.length })
        const sources = research.products.map((product) => ({ title: product.title || `Etsy listing ${product.id}`, url: `https://www.etsy.com/listing/${encodeURIComponent(product.id)}` }))
        const result = await paidResponse(repository, taskId, "market_researcher", `Research question: ${task.research_question}. Analyze this Alura research data in Spanish; distinguish estimates from observed values and mention as_of dates. Never claim these data prove sales or competition completely. Source links are Etsy listing IDs, not independently verified page reads. Data: ${JSON.stringify(research)}.`, false, null)
        repository.saveReport(taskId, result.text, sources)
      } else {
        const result = await paidResponse(repository, taskId, "market_researcher", `Research question: ${task.research_question}. Use real sources and provide dated evidence, limits and URLs. Do not invent sales figures.`, true, null)
        if (result.webCalls === 0 || result.sources.length === 0) throw new Error("Research lacked a web search or verifiable cited source.")
        repository.saveReport(taskId, result.text, result.sources)
      }
    } else if (task.stage === "PRODUCT_PLAN") {
      const research = repository.report(taskId)
      const result = await paidResponse(repository, taskId, "product_planner", `Owner's design brief: ${task.design_brief}\nExisting research for this task: ${research?.content || "None. Do not imply market validation."}\nReturn one product brief only. Do not split the brief into concepts or write image prompts.`, false, "product_brief")
      repository.saveArtifact(taskId, "product_brief", productBriefText(result.text))
    } else if (task.stage === "VISUAL_DESIGN") {
      const brief = repository.artifact(taskId, "product_brief")
      if (!brief) throw new Error("Product brief missing.")
      const examples = repository.relevantDesignExamples(brief.content)
      const conceptCount = task.image_requested ? "Return exactly one finished visual direction for this image request." : "Propose up to three distinct visual directions."
      const result = await paidResponse(repository, taskId, "visual_designer", `Product brief: ${brief.content}\n${DESIGN_PLAYBOOK}\nPlaybook version: ${DESIGN_PLAYBOOK_VERSION}. ${examples.length ? `Relevant owner-approved examples, for reference rather than copying: ${JSON.stringify(examples)}` : "No approved examples yet."}\n${conceptCount} If the owner requested another design in the same niche, make it visibly different from approved examples. Each Kittl prompt must be entirely in English except quoted design copy, and must describe the complete finished result. If text is part of the design, put the exact quoted words, typography and placement inside the prompt itself. For every phrase, explicitly state where it appears (top, center, bottom, etc.) and its visual hierarchy in that same English prompt. Keep metadata consistent with it. Do not ask for an empty area or later text insertion. Do not claim market validation unless it appears in the brief.`, false, "design_concepts")
      let concepts = (JSON.parse(result.text) as { concepts: DesignConcept[] }).concepts
      const issues = reviewDesignConcepts(concepts)
      if (issues.length) {
        repository.event(taskId, "design_quality_revision", { issues })
        const correction = await paidResponse(repository, taskId, "visual_designer", `Correct only these quality defects in your previous concepts: ${issues.join(" ")}. Preserve the product brief and each concept's artistic direction. The complete English Kittl prompt must contain every exact phrase, typography, and explicit placement or hierarchy. Return the full corrected concepts once. Previous concepts: ${JSON.stringify(concepts)}`, false, "design_concepts")
        concepts = (JSON.parse(correction.text) as { concepts: DesignConcept[] }).concepts
      }
      const content = designConceptsText(JSON.stringify({ concepts }))
      repository.saveArtifact(taskId, "design_concepts", content, { concepts })
    } else if (task.stage === "KITTL_SELECT") {
      if (!task.image_requested || !repository.agentConfig("creation_operator").tools.includes("kittl_generate")) throw new Error("Kittl generation is not authorized for this task.")
      const design = repository.artifact(taskId, "design_concepts")
      const concepts = design?.data_json ? (JSON.parse(design.data_json) as { concepts: DesignConcept[] }).concepts : null
      if (!concepts?.length) throw new Error("Design concepts are missing.")
      if (repository.artifact(taskId, "kittl_selection")) throw new Error("Kittl selection already exists; inspect the job before retrying.")
      const options = await kittlOptions()
      const ownerRequest = repository.messages(task.conversation_id).find((message) => message.id === task.owner_message_id)?.content || ""
      const explicitlyNamed = options.models.filter((item) => ownerRequest.toLowerCase().includes(item.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length)[0]
      const preferredName = process.env.COMPANY_KITTL_PILOT_MODEL || PILOT_KITTL_MODEL
      const model = explicitlyNamed || options.models.find((item) => item.name.trim().toLowerCase() === preferredName.toLowerCase())
      if (!model) throw new Error(`El modelo ${preferredName} no aparece en el catálogo de Kittl. No usaré otro sin tu permiso.`)
      const aspectRatio = model.aspectRatios.length ? ["3:4", "9:16"].find((ratio) => model.aspectRatios.includes(ratio)) : "3:4"
      if (!aspectRatio) throw new Error(`${model.name} no admite una proporción vertical.`)
      const selection = { concept_index: 0, model_id: model.id, aspect_ratio: aspectRatio, reason: `Modelo ${model.name} solicitado o configurado para esta prueba.` }
      repository.recordKittlSelection(taskId, selection)
      const generation = await startKittlGeneration(taskId, selection.concept_index, selection.model_id, selection.aspect_ratio, options)
      repository.complete(taskId, `La investigación y el diseño están terminados. He iniciado una imagen en Kittl (trabajo ${generation.job_id}). Te llegará a este mismo chat de Telegram para aprobarla o pedir cambios. No he creado ningún listing.`)
    } else if (task.stage === "SPECIALIST") {
      if (!task.specialist_agent_id || !isConsultableAgent(task.specialist_agent_id) || !task.specialist_question) {
        throw new Error("Invalid specialist assignment.")
      }
      const procedure = AGENT_PROCEDURES[task.specialist_agent_id]
      const result = await paidResponse(repository, taskId, task.specialist_agent_id,
        `Assigned question: ${task.specialist_question}\nExpected input: ${procedure.input}\nDeliverable: ${procedure.output}\nPolicy: ${procedure.policy}\nEscalate when: ${procedure.escalate}\nAvailable evidence: ${specialistContext(repository, task.conversation_id, task.specialist_agent_id)}\nReturn a concise Spanish result. Distinguish completed analysis from actions not performed. If evidence or permission is missing, name it and stop; never claim an external action.`,
        false, null, 850)
      repository.saveSpecialistResult(taskId, result.text)
    } else if (task.stage === "CEO_SYNTHESIZE") {
      const report = repository.report(taskId)
      const design = repository.artifact(taskId, "design_concepts")
      const specialist = repository.artifact(taskId, "specialist_result")
      if (!report && !design && !specialist) throw new Error("Research, design or specialist result missing.")
      const ownerRequest = repository.messages(task.conversation_id).find((message) => message.id === task.owner_message_id)?.content || ""
      const result = design
        ? await paidResponse(repository, taskId, "ceo", `Respond naturally in Spanish, under 220 words. Present distinct concepts and reproduce each Kittl prompt verbatim in English, without translation or paraphrase; those prompts already include any exact lettering, typography and composition. Do not copy the whole brief. Evaluate fit against the request, not unverified commercial potential. State that no image or listing was created.\nOwner request: ${ownerRequest}\nProduct brief: ${repository.artifact(taskId, "product_brief")?.content || "None"}\nVisual concepts: ${design.content}\nResearch sources, if any: ${report?.sources_json || "[]"}`, false, null, 1200)
        : specialist
          ? await paidResponse(repository, taskId, "ceo", `Answer the owner naturally in Spanish. Summarize the assigned specialist's result, its evidence and any limits. Do not imply an external operation occurred.\nOwner request: ${ownerRequest}\nAgent: ${task.specialist_agent_id}\nSpecialist result: ${specialist.content}`, false, null, 900)
          : await paidResponse(repository, taskId, "ceo", `Answer the owner naturally in Spanish. Base claims on this research, cite relevant URLs and explain uncertainty. Do not start production.\nOriginal context: ${contextFor(repository, task.conversation_id)}\nCurrent research: ${report?.content || "None"}\nVerified source URLs: ${report?.sources_json || "[]"}`, false, null)
      repository.complete(taskId, result.text)
    } else throw new Error(`Unknown task stage: ${task.stage}`)
  } catch (error) {
    repository.failTask(taskId, error instanceof Error ? error.message : String(error))
  }
  return repository.task(taskId)
}
