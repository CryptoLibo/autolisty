import OpenAI from "openai"
import fs from "fs"
import path from "path"

export const runtime = "nodejs"
export const maxDuration = 180

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

function cleanText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function clampAltText(text: string, min = 200, max = 250) {
  let normalized = cleanText(text)

  if (normalized.length > max) {
    normalized = normalized.slice(0, max)
    const lastSpace = normalized.lastIndexOf(" ")
    if (lastSpace > 140) normalized = normalized.slice(0, lastSpace)
  }

  return normalized.length < min ? normalized : normalized
}

function titleCase(input: string) {
  return cleanText(input)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const upper = word.toUpperCase()

      if (upper === "TV") return "TV"
      if (upper === "AI") return "AI"

      if (word.startsWith("(") && word.endsWith(")")) {
        const inner = word.slice(1, -1)
        if (inner.toUpperCase() === "DIGITAL DOWNLOAD") {
          return "(Digital Download)"
        }
      }

      if (word.includes("-")) {
        return word
          .split("-")
          .map((part) => {
            const partUpper = part.toUpperCase()
            if (!part) return part
            if (partUpper === "TV") return "TV"
            return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
          })
          .join("-")
      }

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(" ")
}

function dedupeWordRoots(words: string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const word of words) {
    const root = word
      .toLowerCase()
      .replace(/[(),]/g, "")
      .replace(/'s$/i, "")
      .replace(/s$/i, "")

    if (!root) continue

    if (root === "and" || root === "for" || root === "with") {
      result.push(word)
      continue
    }

    if (seen.has(root)) continue
    seen.add(root)
    result.push(word)
  }

  return result
}

function normalizeTitle(rawTitle: unknown, minWords = 13, maxWords = 15) {
  let title = cleanText(rawTitle).replace(/\s+,/g, ",")

  if (!title) return ""

  title = titleCase(title)

  if (!/\(Digital Download\)$/i.test(title)) {
    title = title.replace(/\s*\(?Digital Download\)?$/i, "").trim()
    title += " (Digital Download)"
  }

  const hasSamsungVariant = /Samsung Frame TV Art/i.test(title)
  const hasFrameVariant = /Frame TV Art/i.test(title)

  if (!hasSamsungVariant && !hasFrameVariant) {
    title = `${title.replace(/\s*\(Digital Download\)$/i, "").trim()} Frame TV Art, (Digital Download)`.trim()
  }

  const digitalSuffix = "(Digital Download)"
  const withoutSuffix = title.replace(/\s*\(Digital Download\)$/i, "").trim()

  let prefix = withoutSuffix
  if (prefix.includes(",")) {
    const firstComma = prefix.indexOf(",")
    const before = prefix.slice(0, firstComma).trim()
    const after = prefix.slice(firstComma + 1).replace(/,/g, "").trim()
    prefix = `${before}, ${after}`.trim()
  } else if (/Frame TV Art/i.test(prefix)) {
    prefix = prefix.replace(
      /(Samsung Frame TV Art|Frame TV Art)/i,
      (match) => `${match},`
    )
  }

  prefix = prefix.replace(/,+/g, ",").replace(/\s+,/g, ",").replace(/,\s*,/g, ",")
  prefix = prefix.replace(/,\s*$/, "").trim()

  let words = dedupeWordRoots(prefix.split(/\s+/).filter(Boolean))

  if (words.length > maxWords - 2) {
    words = words.slice(0, maxWords - 2)
  }

  let normalized = `${words.join(" ")} ${digitalSuffix}`.replace(/\s+/g, " ").trim()

  const commaCount = (normalized.match(/,/g) || []).length
  if (commaCount === 0) {
    normalized = normalized.replace(
      /(Samsung Frame TV Art|Frame TV Art)/i,
      (match) => `${match},`
    )
  } else if (commaCount > 1) {
    let usedComma = false
    normalized = normalized.replace(/,/g, () => {
      if (usedComma) return ""
      usedComma = true
      return ","
    })
  }

  normalized = normalized.replace(/\s+\(Digital Download\)$/i, " (Digital Download)")
  normalized = normalized.replace(/\s+/g, " ").trim()

  const finalWords = normalized
    .replace(/[(),]/g, "")
    .split(/\s+/)
    .filter(Boolean)

  if (finalWords.length > maxWords) {
    const parts = normalized
      .replace(/\s*\(Digital Download\)$/i, "")
      .trim()
      .split(/\s+/)
    const allowed = Math.max(minWords, maxWords - 2)
    normalized = `${parts.slice(0, allowed).join(" ")} (Digital Download)`.replace(/\s+/g, " ").trim()
  }

  return normalized
}

function normalizeTags(tags: unknown, maxTags = 13, maxChars = 20) {
  const values = Array.isArray(tags) ? tags : []
  const seen = new Set<string>()
  const result: string[] = []

  for (const tag of values) {
    const clean = cleanText(tag).slice(0, maxChars)
    if (!clean) continue

    const key = clean.toLowerCase()
    if (seen.has(key)) continue

    seen.add(key)
    result.push(clean)
  }

  return result.slice(0, maxTags)
}

function uniquePhrases(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const cleaned = cleanText(value)
    if (!cleaned) continue

    const key = cleaned
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .map((word) => word.replace(/s$/i, ""))
      .join(" ")

    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(cleaned)
  }

  return result
}

function normalizeKeywords5(list: unknown, analysis: Record<string, unknown>) {
  const requested = Array.isArray(list) ? list : []
  const searchPhrases = Array.isArray(analysis.search_phrases)
    ? analysis.search_phrases.map((item) => cleanText(item))
    : []

  const fallback = [
    ...searchPhrases,
    cleanText(analysis.search_intent),
    cleanText(analysis.primary_subject) && `${cleanText(analysis.primary_subject)} artwork`,
    cleanText(analysis.style) && `${cleanText(analysis.style)} wall art`,
    cleanText(analysis.decor_context) && `${cleanText(analysis.decor_context)} decor`,
    "digital frame tv art",
  ].filter(Boolean) as string[]

  return uniquePhrases(
    [...requested.map((item) => cleanText(item)), ...fallback].filter(
      (phrase) => {
        const words = phrase.split(" ").filter(Boolean)
        return words.length >= 2 && words.length <= 4
      }
    )
  ).slice(0, 5)
}

function fillTemplate(template: string, keywords5: string[]) {
  let output = template

  for (let i = 0; i < 5; i++) {
    output = output.replaceAll(`KEYWORD_${i + 1}`, keywords5[i] || "")
  }

  return output
}

function buildTitleFromComponents(
  components: Record<string, unknown>,
  productConfig: Record<string, any>
) {
  const parts = [
    cleanText(components.style),
    cleanText(components.primary_subject),
    cleanText(components.secondary_subject),
    cleanText(components.product_term) ||
      productConfig?.title_rules?.allow_variations?.[0] ||
      productConfig?.product_name ||
      "Frame TV Art",
  ].filter(Boolean)

  const decorContext = cleanText(components.decor_context)

  return `${parts.join(" ")}, ${decorContext} (Digital Download)`.replace(/\s+/g, " ").trim()
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const { productType, designUrl, mockups = [], midjourneyPrompt } = body

    const configPath = path.join(process.cwd(), "product_configs", `${productType}.json`)
    const productConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"))

    const templatePath = path.join(
      process.cwd(),
      "templates",
      productConfig.description_rules.template_file
    )
    const descriptionTemplate = fs.readFileSync(templatePath, "utf-8")

    const systemPrompt = `
You are an elite Etsy SEO strategist working across multiple digital Etsy products.

Your workflow is:
1. Read the product configuration carefully.
2. Analyze the design image and the Midjourney prompt together.
3. Extract the strongest searchable signals for Etsy.
4. Generate a coherent SEO package for the current product.

ANALYSIS PRINCIPLES
- Use the image as the source of truth for what is visually present.
- Use the Midjourney prompt to clarify style, subject intent, mood, and missing visual clues.
- Do not copy Midjourney syntax, weights, parameters, aspect ratios, or camera jargon into the final SEO.
- Think like an Etsy SEO expert, not like an image captioning model.
- Prefer concrete, searchable language over vague aesthetic filler.
- Choose terms that describe what buyers would actually search for on Etsy.

TITLE STRATEGY
- Build a title that feels intentional, searchable, and coherent.
- Follow the title rules from product_config exactly.
- Use the strongest subject, style, and decor context discovered from the image plus prompt.
- Avoid stuffing disconnected words together.
- Prefer a strong search phrase cluster over decorative adjectives.

DESCRIPTION KEYWORDS STRATEGY
- Generate exactly 5 keyword phrases.
- These phrases must strengthen the existing description template.
- KEYWORD_1 must be the strongest Etsy search phrase for this listing, even if it is long-tail.
- Each keyword must have a distinct role and should not feel generic or repetitive.
- Keywords must fit the template naturally.

TAG STRATEGY
- Generate exactly 13 tags.
- Follow the product configuration.
- Keep the current good balance across product, style, subject, decor, and digital format.

ALT TEXT STRATEGY
- Analyze each mockup independently.
- Describe what is actually visible in that image first.
- Use listing keywords only when they fit naturally.
- Keep each alt text unique and image-specific.
- Maintain the original image id and position.

OUTPUT
- Return ONLY valid JSON.
- Do not add markdown.
- Do not add commentary.
`

    const userPrompt = `
product_config:
${JSON.stringify(productConfig)}

description_template:
${descriptionTemplate}

midjourney_prompt:
${midjourneyPrompt}

IMPORTANT IMAGE MAPPING RULES:
- Use the exact mockup id provided.
- Do NOT invent, rename, omit, or reorder ids.
- Each uploaded image must appear exactly once in media when mockups are provided.
- Keep the exact position value provided for each image.

Return JSON in this exact shape:

{
  "analysis": {
    "primary_subject": "",
    "secondary_subject": "",
    "style": "",
    "decor_context": "",
    "mood": "",
    "color_palette": [],
    "search_intent": "",
    "search_phrases": []
  },
  "title_components": {
    "style": "",
    "primary_subject": "",
    "secondary_subject": "",
    "decor_context": "",
    "product_term": ""
  },
  "title": "",
  "description_keywords_5": [],
  "description_final": "",
  "tags_13": [],
  "media": [
    { "id": "", "position": 0, "alt_text": "" }
  ]
}
`

    const response = await client.responses.create({
      model: "gpt-4o",
      temperature: 0.2,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }],
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: userPrompt },
            { type: "input_text", text: "PRIMARY DESIGN IMAGE" },
            { type: "input_image", image_url: designUrl },
            ...mockups.flatMap((img: any) => [
              {
                type: "input_text",
                text: `LISTING IMAGE position=${img.position} id=${img.id}`,
              },
              {
                type: "input_image",
                image_url: img.url,
              },
            ]),
          ],
        },
      ],
    })

    const raw = response.output_text || ""
    const start = raw.indexOf("{")
    const end = raw.lastIndexOf("}")

    if (start === -1 || end === -1) {
      throw new Error("Model did not return JSON")
    }

    const parsed = JSON.parse(raw.slice(start, end + 1))
    const analysis = parsed.analysis && typeof parsed.analysis === "object" ? parsed.analysis : {}
    const titleBase =
      cleanText(parsed.title) || buildTitleFromComponents(parsed.title_components || {}, productConfig)

    const title = normalizeTitle(
      titleBase,
      productConfig?.title_rules?.word_rules?.min_words ?? 13,
      productConfig?.title_rules?.word_rules?.max_words ?? 15
    )
    const tags = normalizeTags(
      parsed.tags_13,
      productConfig?.tag_rules?.max_tags ?? 13,
      productConfig?.tag_rules?.max_characters ?? 20
    )
    const keywords5 = normalizeKeywords5(parsed.description_keywords_5, analysis)
    const description = fillTemplate(descriptionTemplate, keywords5)

    const parsedMedia = Array.isArray(parsed.media) ? parsed.media : []
    const media = mockups.map((img: any) => {
      const foundById = parsedMedia.find((entry: any) => entry.id === img.id)
      const foundByPosition = parsedMedia.find(
        (entry: any) => entry.position === img.position
      )
      const found = foundById || foundByPosition

      return {
        id: img.id,
        position: img.position,
        alt_text: clampAltText(found?.alt_text || ""),
      }
    })

    const output = {
      title,
      description_keywords_5: keywords5,
      description_final: description,
      tags_13: tags,
      media,
    }

    return new Response(JSON.stringify(output), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (err: any) {
    console.error("API ERROR:", err)
    return new Response(err.message || "Server error", { status: 500 })
  }
}
