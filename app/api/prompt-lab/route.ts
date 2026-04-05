import OpenAI from "openai";

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
  prompts: string[];
};

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

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "Reference image is required." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "image/png";
    const dataUrl = toDataUrl(buffer, mimeType);

    const analysisSystemPrompt = `
You are an elite visual direction strategist for generative image workflows.

Your job is to study a reference image and extract the visual DNA that makes it commercially compelling, while avoiding direct imitation.

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
`.trim();

    const analysisResponse = await client.responses.create({
      model: "gpt-4o",
      temperature: 0.3,
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

Return ONLY valid JSON.
`.trim();

    const promptUserPrompt = `
Using the analysis below, generate exactly 4 Midjourney prompts.

Analysis:
${JSON.stringify(analysis, null, 2)}

Return JSON with this exact shape:

{
  "prompts": ["", "", "", ""]
}

Rules:
- Each prompt must describe only the image to be generated.
- Avoid product or usage words such as wall art, printable, poster, frame tv, gallery wall, interior decor, mockup, staged, room, frame, or collectible.
- Keep prompts rich in visual direction, but do not overburden them with negatives.
- Each prompt should feel like a distinct sibling of the same visual family.
- Favor composition, form rhythm, texture, palette, and mood.
- Do not drift into generic product photography or simplistic studio-object shots unless the reference truly works that way.
- If the reference has richness, tension, ornament, or visual sophistication, preserve that level of ambition in the new prompts.
- Create prompts that can compete visually with strong Etsy bestsellers, not safe or watered-down variations.
- Avoid explaining the scene in a flat literal way. Write with strong visual direction and taste.
- Preserve the aesthetic logic of the reference, but change the exact composition, arrangement, and internal relationships enough that the outputs feel like original siblings.
- If subject identity or styling is part of the commercial hook, do not accidentally erase it from all variations.
- Variation should be intentional: some prompts may preserve core identity cues closely, while others may explore them more freely, but the set must not forget what made the reference visually powerful.
- Let the global intent, buyer appeal, room fit, and emotional promise guide the prompts just as much as the local visual details.
`.trim();

    const promptResponse = await client.responses.create({
      model: "gpt-4o",
      temperature: 0.65,
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
    const prompts = (promptSet.prompts || []).map((prompt) => String(prompt || "").trim()).filter(Boolean);
    const midjourneyBlock = buildMidjourneyPermutationBlock(prompts);

    return Response.json({
      summary: analysis.summary,
      globalIntent: analysis.global_intent,
      buyerAppeal: analysis.buyer_appeal,
      roomFit: analysis.room_fit,
      emotionalPromise: analysis.emotional_promise,
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
