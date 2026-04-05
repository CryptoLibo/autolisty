import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 180;

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

type PromptLabAnalysis = {
  summary: string;
  visual_dna: {
    composition: string;
    form_language: string;
    palette: string;
    texture: string;
    mood: string;
    variation_strategy: string;
  };
  style_brief: string;
  prompt_principles: string[];
};

type PromptLabPromptSet = {
  prompts: string[];
  midjourney_block: string;
};

function extractJson<T>(raw: string): T {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return valid JSON.");
  }

  return JSON.parse(raw.slice(start, end + 1)) as T;
}

function toDataUrl(buffer: Buffer, mimeType: string) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
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
  "visual_dna": {
    "composition": "",
    "form_language": "",
    "palette": "",
    "texture": "",
    "mood": "",
    "variation_strategy": ""
  },
  "style_brief": "",
  "prompt_principles": ["", "", "", ""]
}

Rules:
- Focus on the image itself, not on product or mockup language.
- Explain what gives the image its visual identity.
- The variation strategy must explain how to create new siblings of the design without copying it.
- Keep the style brief concise but rich enough to guide prompt generation.
- The prompt principles should be short, practical rules for the next generation pass.
`.trim();

    const analysisResponse = await client.responses.create({
      model: "gpt-4o",
      temperature: 0.4,
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
Using the analysis below, generate exactly 4 Midjourney prompts plus one combined block.

Analysis:
${JSON.stringify(analysis, null, 2)}

Return JSON with this exact shape:

{
  "prompts": ["", "", "", ""],
  "midjourney_block": ""
}

Rules:
- Each prompt must describe only the image to be generated.
- Avoid product or usage words such as wall art, printable, poster, frame tv, gallery wall, interior decor, mockup, staged, room, frame, or collectible.
- Keep prompts rich in visual direction, but do not overburden them with negatives.
- Each prompt should feel like a distinct sibling of the same visual family.
- Favor composition, form rhythm, texture, palette, and mood.
- The combined block must contain all 4 prompts in one paste-friendly text block for Midjourney.
`.trim();

    const promptResponse = await client.responses.create({
      model: "gpt-4o",
      temperature: 0.8,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: promptSystemPrompt }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: promptUserPrompt }],
        },
      ],
    });

    const promptSet = extractJson<PromptLabPromptSet>(promptResponse.output_text || "");

    return Response.json({
      summary: analysis.summary,
      visualDna: {
        composition: analysis.visual_dna.composition,
        formLanguage: analysis.visual_dna.form_language,
        palette: analysis.visual_dna.palette,
        texture: analysis.visual_dna.texture,
        mood: analysis.visual_dna.mood,
        variationStrategy: analysis.visual_dna.variation_strategy,
      },
      styleBrief: analysis.style_brief,
      promptPrinciples: analysis.prompt_principles || [],
      prompts: promptSet.prompts || [],
      midjourneyBlock: promptSet.midjourney_block || "",
    });
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "Failed to generate Prompt Lab output." },
      { status: 500 }
    );
  }
}
