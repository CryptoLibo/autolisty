import OpenAI from "openai";
import { ProductType } from "@/lib/products";

export const runtime = "nodejs";
export const maxDuration = 180;

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

type PromptLabAnalysis = {
  summary: string;
  global_intent: string;
  buyer_appeal: string;
  room_fit: string;
  emotional_promise: string;
  rendering_mode: string;
  subject_mechanics: string;
  variation_logic: string;
  visual_dna: {
    composition: string;
    form_language: string;
    palette: string;
    texture: string;
    mood: string;
    variation_strategy: string;
  };
  subject_identity: string;
  styling_signals: string;
  visual_contrast_logic: string;
  commercial_hook: string;
  variation_boundaries: string;
  style_brief: string;
  prompt_principles: string[];
};

type PromptLabPromptSet = {
  prompts: Array<{
    role: string;
    prompt: string;
    variation_strategy: string;
    seo_signals: string[];
    kept_from_reference: string[];
    changed_from_reference: string[];
  }>;
};

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "global_intent",
    "buyer_appeal",
    "room_fit",
    "emotional_promise",
    "rendering_mode",
    "subject_mechanics",
    "variation_logic",
    "visual_dna",
    "subject_identity",
    "styling_signals",
    "visual_contrast_logic",
    "commercial_hook",
    "variation_boundaries",
    "style_brief",
    "prompt_principles",
  ],
  properties: {
    summary: { type: "string" },
    global_intent: { type: "string" },
    buyer_appeal: { type: "string" },
    room_fit: { type: "string" },
    emotional_promise: { type: "string" },
    rendering_mode: { type: "string" },
    subject_mechanics: { type: "string" },
    variation_logic: { type: "string" },
    visual_dna: {
      type: "object",
      additionalProperties: false,
      required: [
        "composition",
        "form_language",
        "palette",
        "texture",
        "mood",
        "variation_strategy",
      ],
      properties: {
        composition: { type: "string" },
        form_language: { type: "string" },
        palette: { type: "string" },
        texture: { type: "string" },
        mood: { type: "string" },
        variation_strategy: { type: "string" },
      },
    },
    subject_identity: { type: "string" },
    styling_signals: { type: "string" },
    visual_contrast_logic: { type: "string" },
    commercial_hook: { type: "string" },
    variation_boundaries: { type: "string" },
    style_brief: { type: "string" },
    prompt_principles: {
      type: "array",
      items: { type: "string" },
      minItems: 4,
      maxItems: 4,
    },
  },
} as const;

const promptSetSchema = {
  type: "object",
  additionalProperties: false,
  required: ["prompts"],
  properties: {
    prompts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "role",
          "prompt",
          "variation_strategy",
          "seo_signals",
          "kept_from_reference",
          "changed_from_reference",
        ],
        properties: {
          role: { type: "string" },
          prompt: { type: "string" },
          variation_strategy: { type: "string" },
          seo_signals: {
            type: "array",
            items: { type: "string" },
            minItems: 4,
            maxItems: 8,
          },
          kept_from_reference: {
            type: "array",
            items: { type: "string" },
            minItems: 3,
            maxItems: 6,
          },
          changed_from_reference: {
            type: "array",
            items: { type: "string" },
            minItems: 3,
            maxItems: 6,
          },
        },
      },
      minItems: 4,
      maxItems: 4,
    },
  },
} as const;

function extractJson<T>(raw: string): T {
  const normalized = String(raw || "").trim();
  const fenceMatch = normalized.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch?.[1]?.trim() || normalized;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return valid JSON.");
  }

  const jsonText = candidate.slice(start, end + 1);
  return JSON.parse(jsonText) as T;
}

function toDataUrl(buffer: Buffer, mimeType: string) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function escapePermutationPrompt(value: string) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\s+/g, " ")
    .trim();
}

function buildMidjourneyPermutationBlock(prompts: string[]) {
  return `{${prompts.map(escapePermutationPrompt).join(", ")}}`;
}

function getProductCreativeContext(productType: ProductType) {
  if (productType === "printable_wall_art") {
    return [
      "The final image should read as standalone decorative artwork.",
      "Favor strong central or poster-like compositions, clear subject identity, and rich searchable visual nouns.",
      "Vertical-friendly composition is useful, but do not mention aspect ratios or product usage in the prompt.",
    ].join(" ");
  }

  return [
    "The final image should read as immersive horizontal decorative artwork.",
    "Favor balanced wide compositions, atmospheric scene depth, and strong visual impact from a distance.",
    "Avoid product, device, screen, room, staged, or mockup language in the prompt.",
  ].join(" ");
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const rawProductType = String(formData.get("productType") || "frame_tv_art");
    const productType: ProductType =
      rawProductType === "printable_wall_art" ? "printable_wall_art" : "frame_tv_art";
    const productCreativeContext = getProductCreativeContext(productType);

    if (!(file instanceof File)) {
      return Response.json({ error: "Reference image is required." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "image/png";
    const dataUrl = toDataUrl(buffer, mimeType);

    const analysisSystemPrompt = `
You are an elite visual direction strategist for generative image workflows.

Your job is to study a reference image and extract the visual DNA that makes it commercially compelling, while avoiding direct imitation.

You are not creating product mockups. You are analyzing the artwork itself.

Return ONLY valid JSON.
`.trim();

    const analysisUserPrompt = `
Analyze this reference image and return JSON with this exact shape:

{
  "summary": "",
  "global_intent": "",
  "buyer_appeal": "",
  "room_fit": "",
  "emotional_promise": "",
  "rendering_mode": "",
  "subject_mechanics": "",
  "variation_logic": "",
  "visual_dna": {
    "composition": "",
    "form_language": "",
    "palette": "",
    "texture": "",
    "mood": "",
    "variation_strategy": ""
  },
  "subject_identity": "",
  "styling_signals": "",
  "visual_contrast_logic": "",
  "commercial_hook": "",
  "variation_boundaries": "",
  "style_brief": "",
  "prompt_principles": ["", "", "", ""]
}

Rules:
- First understand the image globally before focusing on detail.
- Global intent should explain what the image is really selling as a decorative or emotional object.
- Buyer appeal should explain why a customer would choose it over other designs.
- Room fit should identify the kind of space where the image naturally belongs.
- Emotional promise should explain the feeling or aspiration the artwork gives the buyer.
- Rendering mode should describe how the image feels made: painterly, illustrated, graphic, photographic, semi-real, textured, flat, sculptural, etc.
- Subject mechanics should explain how the subject physically behaves or is constructed in the image, so future variations remain internally coherent.
- Variation logic should explain how to vary the image intelligently without breaking its structure, medium logic, or aesthetic identity.
- Focus on the image itself, not on product or mockup language.
- Explain what gives the image its visual identity.
- Subject identity must capture the kind of subject shown and any identity signals that are visually important to the impact of the image.
- Styling signals must capture details like nails, jewelry, pose, beauty direction, wardrobe fragments, craft cues, or editorial treatment when relevant.
- Visual contrast logic must explain why the subject, material, palette, lighting, and background work so well together.
- Commercial hook must explain what makes the image feel desirable, memorable, or strong as a bestseller.
- Variation boundaries must explain what can change and what should stay structurally important in future variations.
- The variation strategy must explain how to create new siblings of the design without copying it.
- Keep the style brief concise but rich enough to guide prompt generation.
- The prompt principles should be short, practical rules for the next generation pass.
- Capture SEO-useful visual language in the analysis: concrete subject nouns, style, palette, mood, setting, season, material, and composition.
- Do not use product words such as wall art, printable, poster, frame tv, gallery wall, interior decor, mockup, staged, room, screen, device, or product display.
`.trim();

    const analysisResponse = await client.responses.create({
      model: "gpt-5.4-mini",
      temperature: 0.3,
      text: {
        format: {
          type: "json_schema",
          name: "prompt_lab_analysis",
          strict: true,
          schema: analysisSchema,
        },
      },
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: analysisSystemPrompt }],
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: analysisUserPrompt },
            { type: "input_image", image_url: dataUrl, detail: "auto" },
          ],
        },
      ],
    });

    const analysis = extractJson<PromptLabAnalysis>(analysisResponse.output_text || "");

    const promptSystemPrompt = `
You are an expert Midjourney prompt director.

Generate new original prompts that preserve the visual language of the reference analysis, but create different compositions and different internal shape relationships.

The prompts must be production-ready Midjourney prompts for original artwork. They must also carry enough descriptive information for downstream SEO analysis.

Return ONLY valid JSON.
`.trim();

    const promptUserPrompt = `
Using the analysis below, generate exactly 4 Midjourney prompts.

Analysis:
${JSON.stringify(analysis, null, 2)}

Silent product composition context:
${productCreativeContext}

Return JSON with this exact shape:

{
  "prompts": [
    {
      "role": "Closest Commercial Sibling",
      "prompt": "",
      "variation_strategy": "",
      "seo_signals": ["", "", "", ""],
      "kept_from_reference": ["", "", ""],
      "changed_from_reference": ["", "", ""]
    }
  ]
}

Rules:
- Each prompt must describe only the image to be generated.
- Never include product or usage words such as wall art, printable, poster, frame tv, gallery wall, interior decor, mockup, staged, room, screen, device, display, or collectible.
- Do not include Midjourney parameters, aspect ratios, stylize values, seeds, quality values, chaos values, or negative parameter syntax.
- Keep prompts rich in visual direction, but do not overburden them with negatives.
- Each prompt should feel like a distinct sibling of the same visual family, not four near-duplicates.
- Favor concrete subject nouns, composition, form rhythm, texture, palette, mood, season, setting, and medium.
- Do not drift into generic product photography or simplistic studio-object shots unless the reference truly works that way.
- If the reference has richness, tension, ornament, or visual sophistication, preserve that level of ambition in the new prompts.
- Create prompts that can compete visually with strong Etsy bestsellers, not safe or watered-down variations.
- Avoid explaining the scene in a flat literal way. Write with strong visual direction and taste.
- Preserve the aesthetic logic of the reference, but change the exact composition, arrangement, and internal relationships enough that the outputs feel like original siblings.
- If subject identity or styling is part of the commercial hook, do not accidentally erase it from all variations.
- Variation should be intentional: some prompts may preserve core identity cues closely, while others may explore them more freely, but the set must not forget what made the reference visually powerful.
- Let the global intent, buyer appeal, room fit, and emotional promise guide the prompts just as much as the local visual details.
- Let rendering mode guide the medium and finish. Do not default to realism if the reference feels painterly, graphic, illustrated, or stylized.
- Respect subject mechanics. If the subject changes, the physical logic, pose, support, interaction, and behavior of the subject must change coherently too.
- Use variation logic to control how far each prompt can move from the reference without becoming sloppy, repetitive, or structurally wrong.
- Use these exact 4 roles, in this order:
  1. Closest Commercial Sibling: keep the strongest reference appeal, change subject details and arrangement enough to be original.
  2. Subject Expansion: keep the visual DNA, introduce a different but commercially related main subject.
  3. Scene Expansion: keep the style and emotional promise, change the setting, environment, or narrative context.
  4. Seasonal Trend Expansion: keep the identity, introduce a seasonal, cultural, or trend-aware angle when visually appropriate.
- Each prompt must include enough searchable visual signals for SEO later, but those signals must be natural image description, not keyword stuffing.
- Before returning, internally reject and rewrite any prompt that sounds like a mockup, product listing, generic caption, direct copy, or weak variation.
`.trim();

    const promptResponse = await client.responses.create({
      model: "gpt-5.4-mini",
      temperature: 0.65,
      text: {
        format: {
          type: "json_schema",
          name: "prompt_lab_prompt_set",
          strict: true,
          schema: promptSetSchema,
        },
      },
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: promptSystemPrompt }],
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: promptUserPrompt },
            { type: "input_image", image_url: dataUrl, detail: "auto" },
          ],
        },
      ],
    });

    const promptSet = extractJson<PromptLabPromptSet>(promptResponse.output_text || "");
    const promptDetails = (promptSet.prompts || [])
      .map((item) => ({
        role: String(item?.role || "").trim(),
        prompt: String(item?.prompt || "").trim(),
        variationStrategy: String(item?.variation_strategy || "").trim(),
        seoSignals: Array.isArray(item?.seo_signals)
          ? item.seo_signals.map((signal) => String(signal || "").trim()).filter(Boolean)
          : [],
        keptFromReference: Array.isArray(item?.kept_from_reference)
          ? item.kept_from_reference.map((signal) => String(signal || "").trim()).filter(Boolean)
          : [],
        changedFromReference: Array.isArray(item?.changed_from_reference)
          ? item.changed_from_reference.map((signal) => String(signal || "").trim()).filter(Boolean)
          : [],
      }))
      .filter((item) => item.prompt);
    const prompts = promptDetails.map((item) => item.prompt);
    const midjourneyBlock = buildMidjourneyPermutationBlock(prompts);

    return Response.json({
      summary: analysis.summary,
      globalIntent: analysis.global_intent,
      buyerAppeal: analysis.buyer_appeal,
      roomFit: analysis.room_fit,
      emotionalPromise: analysis.emotional_promise,
      renderingMode: analysis.rendering_mode,
      subjectMechanics: analysis.subject_mechanics,
      variationLogic: analysis.variation_logic,
      visualDna: {
        composition: analysis.visual_dna.composition,
        formLanguage: analysis.visual_dna.form_language,
        palette: analysis.visual_dna.palette,
        texture: analysis.visual_dna.texture,
        mood: analysis.visual_dna.mood,
        variationStrategy: analysis.visual_dna.variation_strategy,
      },
      subjectIdentity: analysis.subject_identity,
      stylingSignals: analysis.styling_signals,
      visualContrastLogic: analysis.visual_contrast_logic,
      commercialHook: analysis.commercial_hook,
      variationBoundaries: analysis.variation_boundaries,
      styleBrief: analysis.style_brief,
      promptPrinciples: analysis.prompt_principles || [],
      promptDetails,
      prompts,
      midjourneyBlock,
    });
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "Failed to generate Prompt Lab output." },
      { status: 500 }
    );
  }
}
