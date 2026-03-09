import OpenAI from "openai"
import fs from "fs"
import path from "path"

export const runtime = "nodejs"
export const maxDuration = 180

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

function clampAltText(text: string, min = 200, max = 250) {
  let t = (text || "").replace(/\s+/g, " ").trim()

  if (t.length > max) {
    t = t.slice(0, max)
    const lastSpace = t.lastIndexOf(" ")
    if (lastSpace > 140) t = t.slice(0, lastSpace)
  }

  return t
}

function titleCase(input: string) {
  const words = input.split(" ").filter(Boolean)

  return words
    .map((word) => {
      if (word.toUpperCase() === "TV") return "TV"
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(" ")
}

function ensureShortTitleWordRange(title: string, minWords = 13, maxWords = 14) {
  const words = title.split(/\s+/).filter(Boolean)

  if (words.length > maxWords) {
    return words.slice(0, maxWords).join(" ")
  }

  return title
}

function ensureLongTitleCharRange(title: string, minChars = 135, maxChars = 140) {
  let t = title.trim()

  if (t.length > maxChars) {
    t = t.slice(0, maxChars)
    const lastSpace = t.lastIndexOf(" ")
    if (lastSpace > 90) t = t.slice(0, lastSpace)
  }

  if (t.length < minChars) {
    if (!t.toLowerCase().includes("(digital download)")) {
      t += " (Digital Download)"
    }
  }

  if (t.length > maxChars) t = t.slice(0, maxChars)

  return t
}

function normalizeTags(tags: any, maxTags = 13, maxChars = 20) {
  const arr = Array.isArray(tags) ? tags : []

  const clean = arr
    .map((x) => String(x).trim())
    .filter(Boolean)
    .map((x) => x.slice(0, maxChars))

  const seen = new Set<string>()
  const result: string[] = []

  for (const tag of clean) {
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(tag)
  }

  return result.slice(0, maxTags)
}

function normalizeKeywords5(list: any) {
  const arr = Array.isArray(list) ? list : []

  const clean = arr
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .map((x) => x.replace(/\s+/g, " "))
    .filter((x) => {
      const wc = x.split(" ").length
      return wc >= 2
    })

  return clean.slice(0, 5)
}

function fillTemplate(template: string, keywords5: string[]) {
  let out = template

  for (let i = 0; i < 5; i++) {
    const key = `KEYWORD_${i + 1}`
    out = out.replaceAll(key, keywords5[i] || "")
  }

  return out
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const {
      productType,
      designUrl,
      mockups,
      primaryKeywords,
      secondaryKeywords,
      contextInfo,
      competitorTitles,
      competitorTags
    } = body

    const configPath = path.join(
      process.cwd(),
      "product_configs",
      `${productType}.json`
    )

    const productConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"))

    const templatePath = path.join(
      process.cwd(),
      "templates",
      productConfig.description_rules.template_file
    )

    const descriptionTemplate = fs.readFileSync(templatePath, "utf-8")

    const systemPrompt = `
You are an elite Etsy SEO strategist specialized in digital wall art and Frame TV art.

Follow the product configuration strictly.

You must analyze the listing using this framework:
STYLE
SUBJECT
SCENE
CONTEXT

TITLE RULES
- Short title must contain 13 to 14 words.
- Long title must contain 135 to 140 characters.
- Use Title Case.
- Maintain this structure naturally:
  PRIMARY KEYWORDS + Frame TV Art + SECONDARY KEYWORDS + (Digital Download)
- "Frame TV Art" must remain present.
- "(Digital Download)" must remain present.
- Avoid filler words like cute, perfect, aesthetic, beautiful.
- Titles must sound premium, natural, and conversion-oriented.
- Use as many relevant words as possible without sounding spammy.

DESCRIPTION KEYWORDS
- choose exactly 5 keyword phrases
- KEYWORD_1 must be the strongest search-intent phrase
- all keywords must be coherent with the listing
- each keyword must contain at least 2 words
- keywords must feel natural, strong, and commercially useful

TAGS
- generate exactly 13 tags
- each tag max 20 characters
- use as much of the 20-character limit as possible when natural
- use multi-word phrases when possible
- avoid duplicates, redundant singular/plural variants, and weak filler terms

ALT TEXT
- generate one unique alt text per mockup image
- each alt text must contain 200 to 250 characters
- describe exactly what is visible in the image
- include composition, interior setting, colors, decor style, and artwork placement
- naturally integrate listing keywords where relevant
- do not use generic filler
- do not repeat the same sentence structure across images
- do not output keyword stuffing

Return ONLY valid JSON.
`

    const userPrompt = `
product_config:
${JSON.stringify(productConfig)}

description_template:
${descriptionTemplate}

primary_keywords:
${primaryKeywords}

secondary_keywords:
${secondaryKeywords}

context:
${contextInfo}

competitor_titles:
${competitorTitles}

competitor_tags:
${competitorTags}

Return JSON in exactly this shape:

{
  "title_short_14_words": "",
  "title_long_135_140_chars": "",
  "description_keywords_5": [],
  "description_final": "",
  "tags_13": [],
  "media": [
    {
      "id": "",
      "position": 0,
      "alt_text": ""
    }
  ]
}
`

    const response = await client.responses.create({
      model: "gpt-4o",
      temperature: 0.6,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }]
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: userPrompt },
            { type: "input_image", image_url: designUrl },
            ...mockups.flatMap((img: any) => [
              {
                type: "input_text",
                text: `MOCKUP position=${img.position} id=${img.id}`
              },
              {
                type: "input_image",
                image_url: img.url
              }
            ])
          ]
        }
      ]
    })

    const raw = response.output_text || ""

    const start = raw.indexOf("{")
    const end = raw.lastIndexOf("}")

    if (start === -1 || end === -1) {
      throw new Error("Model did not return JSON")
    }

    const parsed = JSON.parse(raw.slice(start, end + 1))

    const shortTitle = ensureShortTitleWordRange(
      titleCase(parsed.title_short_14_words),
      13,
      14
    )

    const longTitle = ensureLongTitleCharRange(
      titleCase(parsed.title_long_135_140_chars),
      135,
      140
    )

    const tags = normalizeTags(parsed.tags_13)

    const keywords5 = normalizeKeywords5(parsed.description_keywords_5)

    const description = fillTemplate(descriptionTemplate, keywords5)

    const media = mockups.map((img: any) => {
      const found = parsed.media.find((m: any) => m.position === img.position)

      return {
        id: img.id,
        position: img.position,
        alt_text: clampAltText(found?.alt_text || "")
      }
    })

    const output = {
      title_short_14_words: shortTitle,
      title_long_135_140_chars: longTitle,
      description_keywords_5: keywords5,
      description_final: description,
      tags_13: tags,
      media
    }

    return new Response(JSON.stringify(output), {
      headers: { "Content-Type": "application/json" }
    })
  } catch (err: any) {
    console.error("API ERROR:", err)
    return new Response(err.message || "Server error", { status: 500 })
  }
}