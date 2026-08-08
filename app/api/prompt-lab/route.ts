import OpenAI from "openai";
import { normalizeProductType, ProductType } from "@/lib/products";

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

type PngPromptLabAnalysis = {
  summary: string;
  primary_niche: string;
  niche_definition: string;
  target_buyer: string;
  purchase_intent: string;
  emotional_promise: string;
  trend_synthesis: string;
  shared_trend_signals: string[];
  reference_findings: Array<{
    reference_index: number;
    main_subject: string;
    visible_text: string;
    message_mechanism: string;
    composition: string;
    style_and_finish: string;
    commercial_signal: string;
    avoid_copying: string;
  }>;
  visual_dna: {
    composition: string;
    silhouette: string;
    form_language: string;
    palette: string;
    texture: string;
    typography_relationship: string;
    mood: string;
  };
  text_strategy: string;
  subject_mechanics: string;
  compatible_niche_expansions: string[];
  production_strategy: string;
  originality_guardrails: string[];
  commercial_hook: string;
  variation_boundaries: string;
  style_brief: string;
  prompt_principles: string[];
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

const pngAnalysisSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "primary_niche",
    "niche_definition",
    "target_buyer",
    "purchase_intent",
    "emotional_promise",
    "trend_synthesis",
    "shared_trend_signals",
    "reference_findings",
    "visual_dna",
    "text_strategy",
    "subject_mechanics",
    "compatible_niche_expansions",
    "production_strategy",
    "originality_guardrails",
    "commercial_hook",
    "variation_boundaries",
    "style_brief",
    "prompt_principles",
  ],
  properties: {
    summary: { type: "string" },
    primary_niche: { type: "string" },
    niche_definition: { type: "string" },
    target_buyer: { type: "string" },
    purchase_intent: { type: "string" },
    emotional_promise: { type: "string" },
    trend_synthesis: { type: "string" },
    shared_trend_signals: {
      type: "array",
      items: { type: "string" },
      minItems: 4,
      maxItems: 8,
    },
    reference_findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "reference_index",
          "main_subject",
          "visible_text",
          "message_mechanism",
          "composition",
          "style_and_finish",
          "commercial_signal",
          "avoid_copying",
        ],
        properties: {
          reference_index: { type: "integer", minimum: 1, maximum: 3 },
          main_subject: { type: "string" },
          visible_text: { type: "string" },
          message_mechanism: { type: "string" },
          composition: { type: "string" },
          style_and_finish: { type: "string" },
          commercial_signal: { type: "string" },
          avoid_copying: { type: "string" },
        },
      },
      minItems: 1,
      maxItems: 3,
    },
    visual_dna: {
      type: "object",
      additionalProperties: false,
      required: [
        "composition",
        "silhouette",
        "form_language",
        "palette",
        "texture",
        "typography_relationship",
        "mood",
      ],
      properties: {
        composition: { type: "string" },
        silhouette: { type: "string" },
        form_language: { type: "string" },
        palette: { type: "string" },
        texture: { type: "string" },
        typography_relationship: { type: "string" },
        mood: { type: "string" },
      },
    },
    text_strategy: { type: "string" },
    subject_mechanics: { type: "string" },
    compatible_niche_expansions: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 6,
    },
    production_strategy: { type: "string" },
    originality_guardrails: {
      type: "array",
      items: { type: "string" },
      minItems: 4,
      maxItems: 8,
    },
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

async function generatePngDesignPromptLab(dataUrls: string[]) {
  const referenceCount = dataUrls.length;
  const referenceImages = dataUrls.map((imageUrl) => ({
    type: "input_image" as const,
    image_url: imageUrl,
    detail: "high" as const,
  }));

  const analysisResponse = await client.responses.create({
    model: "gpt-5.4-mini",
    temperature: 0.25,
    text: {
      format: {
        type: "json_schema",
        name: "png_prompt_lab_analysis",
        strict: true,
        schema: pngAnalysisSchema,
      },
    },
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: `You are an elite Etsy PNG trend analyst and original graphic-design director. Analyze references as market evidence, never as artwork to reproduce. Identify the durable niche, buyer identity, message mechanism, visual system, and commercial pattern behind the references. Separate shared trend signals from distinctive elements that must not be copied. Read visible text carefully, but never recommend reusing a reference phrase. Return only valid JSON.`,
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Analyze the ${referenceCount} attached reference ${referenceCount === 1 ? "design" : "designs"} exhaustively.

The references come from successful products in one market niche. Determine the PRIMARY NICHE from the audience, identity, subject, message, humor or emotional promise. That primary niche is a hard creative constraint for every later concept. Compatible subniches may enrich it but may never replace it.

For each reference, record its subject, every legible word, phrase mechanism, composition, visual finish, commercial signal, and the distinctive combination that must not be copied. If text is unreadable, say so instead of guessing.

When several references are supplied:
- Treat repeated signals as evidence of the trend.
- Treat one-off characters, exact phrases, poses, layouts and icon combinations as reference-specific material to avoid copying.
- Synthesize the shared commercial logic instead of blending the designs into a collage.

Analyze typography as part of the image: wording structure, tone, cadence, hierarchy, font personality and its relationship with illustration. Define how future wording can be original while preserving the successful message mechanism.

The future output is an isolated, production-ready graphic on transparent background. Analyze silhouette, edge clarity, visual hierarchy and contrast that can remain readable across light and dark surfaces. Do not describe a shirt, mug, product, model, mockup or staged scene.

Return all fields required by the JSON schema. The reference_findings array must contain exactly ${referenceCount} items, numbered in attachment order.`,
          },
          ...referenceImages,
        ],
      },
    ],
  });

  const analysis = extractJson<PngPromptLabAnalysis>(analysisResponse.output_text || "");

  const promptResponse = await client.responses.create({
    model: "gpt-5.4-mini",
    temperature: 0.7,
    text: {
      format: {
        type: "json_schema",
        name: "png_prompt_lab_prompt_set",
        strict: true,
        schema: promptSetSchema,
      },
    },
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: `You are an expert prompt director for commercially strong, original transparent-background graphics. Convert market intelligence into four distinct concepts without copying the source artwork. The primary niche is immutable. Return only valid JSON.`,
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Create exactly four production-ready image-generation prompts from this analysis:

${JSON.stringify(analysis, null, 2)}

Use these exact roles in this order:
1. Trend-Aligned Original
2. Compatible Niche Crossover
3. Fresh Phrase or Subject Concept
4. Seasonal or Evergreen Expansion

Non-negotiable rules:
- Every concept must clearly remain inside the primary niche: "${analysis.primary_niche}". An adjacent niche may support it but may not become the main idea.
- Create original concepts, not paraphrased copies. Never reuse a visible reference phrase, distinctive mascot, exact pose, exact layout, or signature icon combination.
- Each concept must meaningfully transform at least three of these: phrase, main subject, composition, supporting motifs, palette, typography treatment, or narrative action.
- Preserve the proven commercial mechanism, buyer identity, emotional intention and relevant trend signals.
- If a concept contains text, include one exact NEW phrase in quotation marks, spell it correctly, keep it concise, and describe its typographic hierarchy. Do not ask the image model to invent wording.
- If the reference succeeds without text, do not force text into every concept.
- Describe only the final isolated graphic: transparent background, centered balanced composition, clean transparent margins, crisp print-ready edges, strong silhouette and intentional contrast.
- Make the contrast system adaptable to both light and dark surfaces through a coherent outline, keyline, shadow or palette separation when aesthetically appropriate. Do not mention those products or surfaces in the prompt.
- Never mention PNG, file, download, dimensions, Etsy, sublimation, merchandise, shirt, t-shirt, mug, hat, ornament, product, mockup, model, room, scene presentation, or generation parameters.
- Include concrete SEO-useful visual information naturally: niche, audience or identity, original phrase when present, subjects, style, palette, typography, motifs, composition, finish and mood.
- Keep each prompt visually precise enough to generate directly in Kittl or another image model.
- The crossover must combine only a genuinely compatible subniche from the analysis.
- The seasonal concept should be seasonal only when the connection is natural; otherwise make it an evergreen identity or gift-intent expansion.
- variation_strategy must explain the commercial reasoning and how originality is protected.
- kept_from_reference lists abstract trend mechanisms only, never copyable expressions.
- changed_from_reference identifies the concrete transformations that make the concept original.

Before returning, silently reject any concept that drifts from the primary niche, copies a reference, produces a mockup, lacks transparent-background production logic, or uses vague filler language.`,
          },
          ...referenceImages,
        ],
      },
    ],
  });

  const promptSet = extractJson<PromptLabPromptSet>(promptResponse.output_text || "");
  const promptDetails = mapPromptDetails(promptSet);
  const prompts = promptDetails.map((item) => item.prompt);

  return Response.json({
    summary: analysis.summary,
    globalIntent: analysis.trend_synthesis,
    buyerAppeal: `${analysis.target_buyer}. ${analysis.purchase_intent}`,
    roomFit: analysis.niche_definition,
    emotionalPromise: analysis.emotional_promise,
    renderingMode: analysis.visual_dna.typography_relationship,
    subjectMechanics: analysis.subject_mechanics,
    variationLogic: analysis.variation_boundaries,
    visualDna: {
      composition: analysis.visual_dna.composition,
      formLanguage: `${analysis.visual_dna.silhouette}. ${analysis.visual_dna.form_language}`,
      palette: analysis.visual_dna.palette,
      texture: analysis.visual_dna.texture,
      mood: analysis.visual_dna.mood,
      variationStrategy: analysis.production_strategy,
    },
    subjectIdentity: analysis.primary_niche,
    stylingSignals: analysis.shared_trend_signals.join(", "),
    visualContrastLogic: analysis.production_strategy,
    commercialHook: analysis.commercial_hook,
    variationBoundaries: analysis.variation_boundaries,
    styleBrief: analysis.style_brief,
    promptPrinciples: analysis.prompt_principles,
    pngStrategy: {
      primaryNiche: analysis.primary_niche,
      targetBuyer: analysis.target_buyer,
      trendSynthesis: analysis.trend_synthesis,
      sharedSignals: analysis.shared_trend_signals,
      textStrategy: analysis.text_strategy,
      productionStrategy: analysis.production_strategy,
      originalityGuardrails: analysis.originality_guardrails,
      compatibleNicheExpansions: analysis.compatible_niche_expansions,
    },
    referenceFindings: analysis.reference_findings.map((finding) => ({
      referenceIndex: finding.reference_index,
      mainSubject: finding.main_subject,
      visibleText: finding.visible_text,
      messageMechanism: finding.message_mechanism,
      composition: finding.composition,
      styleAndFinish: finding.style_and_finish,
      commercialSignal: finding.commercial_signal,
      avoidCopying: finding.avoid_copying,
    })),
    promptDetails,
    prompts,
    midjourneyBlock: prompts.map((prompt, index) => `${index + 1}. ${prompt}`).join("\n\n"),
  });
}

function mapPromptDetails(promptSet: PromptLabPromptSet) {
  return (promptSet.prompts || [])
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
}

function getProductCreativeContext(productType: ProductType) {
  if (productType === "vertical_wall_art") {
    return [
      "The final image should read as standalone decorative artwork.",
      "Favor strong vertical compositions, clear subject identity, and rich searchable visual nouns.",
      "Do not mention aspect ratios or product usage in the prompt.",
    ].join(" ");
  }

  if (productType === "horizontal_wall_art") {
    return [
      "The final image should read as standalone decorative artwork with a naturally wide visual flow.",
      "Favor balanced horizontal scene depth, strong left-to-right composition, and visual impact from a distance.",
      "Do not mention aspect ratios or product usage in the prompt.",
    ].join(" ");
  }

  if (productType === "nursery_wall_art") {
    return [
      "The final image should read as standalone decorative artwork suited to soft, gentle, child-friendly visual worlds.",
      "Favor calm subjects, warm charm, soft palettes, whimsical detail, and clear searchable visual nouns.",
      "Avoid words that would make the model create a nursery room, framed product, staged scene, or mockup.",
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
    const rawProductType = String(formData.get("productType") || "frame_tv_art");
    const productType = normalizeProductType(rawProductType);
    const productCreativeContext = getProductCreativeContext(productType);
    const submittedFiles = formData
      .getAll("files")
      .filter((value): value is File => value instanceof File);
    const legacyFile = formData.get("file");
    const files = submittedFiles.length
      ? submittedFiles
      : legacyFile instanceof File
        ? [legacyFile]
        : [];
    const maximumReferences = productType === "png_designs" ? 3 : 1;

    if (!files.length) {
      return Response.json({ error: "At least one reference image is required." }, { status: 400 });
    }

    if (files.length > maximumReferences) {
      return Response.json(
        { error: `This product accepts up to ${maximumReferences} reference image${maximumReferences === 1 ? "" : "s"}.` },
        { status: 400 }
      );
    }

    const dataUrls = await Promise.all(
      files.map(async (file) => {
        if (!file.type.startsWith("image/")) {
          throw new Error("Every reference must be an image.");
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        return toDataUrl(buffer, file.type || "image/png");
      })
    );

    if (productType === "png_designs") {
      return generatePngDesignPromptLab(dataUrls);
    }

    const dataUrl = dataUrls[0];

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
    const promptDetails = mapPromptDetails(promptSet);
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
