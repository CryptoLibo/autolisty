import OpenAI from "openai"
import type { CreativeProvider, GenerationContext, GenerationResult } from "./creativeEngine"
import type { PromptCandidate } from "./promptDiversity"

const schema = {
  type: "object", additionalProperties: false, required: ["prompts"],
  properties: { prompts: { type: "array", items: { type: "object", additionalProperties: false,
    required: ["title", "prompt", "subject", "composition", "commercialAngle"],
    properties: Object.fromEntries(["title", "prompt", "subject", "composition", "commercialAngle"].map((key) => [key, { type: "string" }])) } } },
} as const
const repairSchema = {
  type: "object", additionalProperties: false, required: ["replacements"],
  properties: { replacements: { type: "array", items: { type: "object", additionalProperties: false,
    required: ["index", "prompt"], properties: { index: { type: "integer" }, prompt: schema.properties.prompts.items } } } },
} as const

export function createOpenAICreativeProvider(): CreativeProvider {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const model = "gpt-5.4-mini"
  async function call(context: GenerationContext, repair?: { prompts: PromptCandidate[]; issues: Array<{ index: number; reason: string }> }) {
    const mode = context.mode === "independent" ? "four genuinely independent creative concepts" : "four commercially distinct interpretations of one shared concept"
    const instructions = `You are an expert commercial art director and English image-prompt writer. Return exactly four final-image prompts. Create ${mode}. Each prompt must be a precise standalone visual description in English, including the intended subject, composition, style, palette, typography and exact text if present. Differentiate subject, composition or buyer intent substantially, not merely colors. Do not invent market validation or verified trends. Treat research drafts as owner hypotheses. Avoid mockups, product staging and generation parameters. Apply these active owner corrections exactly: ${JSON.stringify(context.rules.map((rule) => rule.instruction))}. Instruction version: ${context.instructionVersion}.`
    const source = {
      brief: context.brief, niche: context.niche || null,
      investigationDraft: context.investigation ? { title: context.investigation.title, query: context.investigation.query } : null,
      opportunity: context.opportunity?.title || null,
      opportunityEvidence: context.opportunityEvidence || [],
      productContext: context.productType || null,
      requiredTerms: context.requiredTerms || [],
      repair: repair ? { issues: repair.issues, previousPrompts: repair.prompts,
        instruction: "Return replacements only for affected indexes. Do not return unaffected prompts." } : null,
    }
    const content: Array<{ type: "input_text"; text: string } | { type: "input_image"; image_url: string; detail: "auto" }> =
      [{ type: "input_text", text: JSON.stringify(source) }]
    for (const url of context.referenceImages || []) content.push({ type: "input_image", image_url: url, detail: "auto" })
    const response = await client.responses.create({ model, temperature: 0.5,
      text: { format: { type: "json_schema", name: repair ? "creative_prompt_repair" : "creative_prompt_set", strict: true,
        schema: repair ? repairSchema : schema } },
      input: [{ role: "system", content: [{ type: "input_text", text: instructions }] }, { role: "user", content }],
    })
    const result = JSON.parse(response.output_text || "{}") as { prompts?: PromptCandidate[]; replacements?: Array<{ index: number; prompt: PromptCandidate }> }
    if (repair && !Array.isArray(result.replacements)) throw new Error("The model did not return targeted repairs.")
    if (!repair && (!Array.isArray(result.prompts) || result.prompts.length !== 4)) throw new Error("The model did not return four prompts.")
    return { ...result, usage: { inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens, totalTokens: response.usage?.total_tokens } }
  }
  return { model, generate: async (context) => call(context) as Promise<GenerationResult>,
    repair: async (context, prompts, issues) => call(context, { prompts, issues }) as Promise<{
      replacements: Array<{ index: number; prompt: PromptCandidate }>; usage?: GenerationResult["usage"] }> }
}
