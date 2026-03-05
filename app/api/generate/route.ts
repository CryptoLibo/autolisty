import OpenAI from "openai";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 180;

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

async function fileToDataUrl(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buffer.toString("base64")}`;
}

function extractJsonObject(text: string): any {
  const s = text.trim();

  if (s.startsWith("{") && s.endsWith("}")) {
    return JSON.parse(s);
  }

  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return JSON.");
  }

  const candidate = s.slice(start, end + 1);
  return JSON.parse(candidate);
}

function clampAltText(text: string, min = 150, max = 250) {
  let t = (text || "").replace(/\s+/g, " ").trim();

  if (t.length < min) {
    t =
      t +
      " The scene, colors, and styling shown help illustrate how the artwork looks when displayed.";
  }

  if (t.length > max) {
    t = t.slice(0, max - 3).trimEnd() + "...";
  }

  return t;
}

function titleCase(input: string) {
  const words = input.split(" ").filter(Boolean);

  return words
    .map((word) => {
      if (word.toUpperCase() === "TV") return "TV";
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function wordCount(s: string) {
  return (s || "").trim().split(/\s+/).filter(Boolean).length;
}

function ensureShortTitleMaxWords(title: string, maxWords = 14) {
  const words = title.split(" ");
  if (words.length <= maxWords) return title;
  return words.slice(0, maxWords).join(" ");
}

function ensureLongTitleCharRange(title: string, minChars = 135, maxChars = 140) {
  let t = title.trim();

  if (t.length > maxChars) {
    t = t.slice(0, maxChars);
    const lastSpace = t.lastIndexOf(" ");
    if (lastSpace > 60) t = t.slice(0, lastSpace);
  }

  if (t.length < minChars) {
    if (!t.toLowerCase().includes("(digital download)")) {
      t += " (Digital Download)";
    }
  }

  if (t.length > maxChars) t = t.slice(0, maxChars);

  return t;
}

function normalizeTags(tags: any, maxTags = 13, maxChars = 20) {
  const arr = Array.isArray(tags) ? tags : [];

  const clean = arr
    .map((x) => String(x).trim())
    .filter(Boolean)
    .map((x) => x.slice(0, maxChars));

  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of clean) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }

  return result.slice(0, maxTags);
}

/* ---------- DESCRIPTION KEYWORDS ---------- */

function normalizeKeywords5(list: any) {
  const arr = Array.isArray(list) ? list : [];

  const clean = arr
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .map((x) => x.replace(/\s+/g, " "))
    .filter((x) => {
      const wc = x.split(" ").length;
      return wc >= 2 && wc <= 3;
    });

  const result = clean.slice(0, 5);

  // ordenar por fuerza (frases más largas primero)
  result.sort((a, b) => b.length - a.length);

  return result;
}

function fillTemplate(template: string, keywords5: string[]) {
  let out = template;

  for (let i = 0; i < 5; i++) {
    const key = `KEYWORD_${i + 1}`;
    out = out.replaceAll(key, keywords5[i] || "");
  }

  return out;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const productType = String(formData.get("productType") || "frame_tv_art");

    const designImage = formData.get("designImage") as File;

    const primaryKeywords = String(formData.get("primaryKeywords") || "");
    const secondaryKeywords = String(formData.get("secondaryKeywords") || "");
    const contextInfo = String(formData.get("contextInfo") || "");

    const competitorTitles = String(formData.get("competitorTitles") || "");
    const competitorTags = String(formData.get("competitorTags") || "");

    const listingManifest = JSON.parse(
      String(formData.get("listingManifest") || "[]")
    );

    const listingImages = formData.getAll("listingImages") as File[];

    if (!designImage) {
      return new Response("Missing design image", { status: 400 });
    }

    const configPath = path.join(
      process.cwd(),
      "product_configs",
      `${productType}.json`
    );

    const productConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    const templatePath = path.join(
      process.cwd(),
      "templates",
      productConfig.description_rules.template_file
    );

    const descriptionTemplate = fs.readFileSync(templatePath, "utf-8");

    const fileMap = new Map<string, File>();

    for (const file of listingImages) {
      fileMap.set(file.name, file);
    }

    const orderedImages = listingManifest
      .sort((a: any, b: any) => a.order - b.order)
      .map((item: any, idx: number) => ({
        id: item.id,
        order: item.order,
        position: idx + 1,
        file: fileMap.get(item.id),
      }));

    const designDataUrl = await fileToDataUrl(designImage);

    const imageInputs = [];

    for (const img of orderedImages) {
      const dataUrl = await fileToDataUrl(img.file);
      imageInputs.push({
        id: img.id,
        order: img.order,
        position: img.position,
        dataUrl,
      });
    }

    const systemPrompt = `
You are an expert Etsy SEO copywriter.

Follow the product configuration strictly.

TITLE RULES
- Short title: max 14 words.
- Long title: 135-140 characters.
- Title Case.
- Avoid filler words like cute, aesthetic, perfect.

TAGS
- exactly 13
- max 20 characters
- multi-word phrases
- avoid duplicates

DESCRIPTION KEYWORDS
- choose exactly 5 keyword phrases
- each must be 2–3 words
- KEYWORD_1 must be the strongest phrase
- avoid single words
- avoid phrases longer than 3 words
- keywords must fit naturally in the description template

ALT TEXT
- describe what the image shows
- 150–250 characters
- integrate keywords naturally
- no keyword lists
- unique for each image

Return ONLY valid JSON.
`;

    const userPrompt = `
product_config:
${JSON.stringify(productConfig)}

description_template:
${descriptionTemplate}

primary_keywords: ${primaryKeywords}
secondary_keywords: ${secondaryKeywords}
context: ${contextInfo}

competitor_titles:
${competitorTitles}

competitor_tags:
${competitorTags}

Return JSON:

{
"title_short_14_words": "",
"title_long_135_140_chars": "",
"description_keywords_5": [],
"description_final": "",
"tags_13": [],
"media":[
{id:"",order:0,position:0,alt_text:""}
]
}
`;

    const response = await client.responses.create({
      model: "gpt-4o",
      temperature: 0.6,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }],
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: userPrompt },
            { type: "input_image", image_url: designDataUrl },
            ...imageInputs.flatMap((img) => [
              {
                type: "input_text",
                text: `MOCKUP IMAGE id=${img.id} position=${img.position}`,
              },
              {
                type: "input_image",
                image_url: img.dataUrl,
              },
            ]),
          ],
        },
      ],
    });

    const raw = response.output_text || "";

    const parsed = extractJsonObject(raw);

    const shortTitle = ensureShortTitleMaxWords(
      titleCase(parsed.title_short_14_words),
      14
    );

    const longTitle = ensureLongTitleCharRange(
      titleCase(parsed.title_long_135_140_chars),
      135,
      140
    );

    const tags = normalizeTags(parsed.tags_13);

    const keywords5 = normalizeKeywords5(parsed.description_keywords_5);

    const description = fillTemplate(descriptionTemplate, keywords5);

    const media = orderedImages.map((img) => {
      const found = parsed.media.find((m: any) => m.id === img.id);

      return {
        id: img.id,
        order: img.order,
        position: img.position,
        alt_text: clampAltText(found?.alt_text || ""),
      };
    });

    const output = {
      title_short_14_words: shortTitle,
      title_long_135_140_chars: longTitle,
      description_keywords_5: keywords5,
      description_final: description,
      tags_13: tags,
      media,
    };

    return new Response(JSON.stringify(output), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("API ERROR:", err);
    return new Response(err.message || "Server error", { status: 500 });
  }
}