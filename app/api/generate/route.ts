import OpenAI from "openai"
import fs from "fs"
import path from "path"

export const runtime = "nodejs"
export const maxDuration = 180

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

function clampAltText(text: string, min = 150, max = 250) {
  let t = (text || "").replace(/\s+/g, " ").trim()

  if (t.length < min) {
    t =
      t +
      " The scene, colors, and styling shown help illustrate how the artwork looks when displayed."
  }

  if (t.length > max) {
    t = t.slice(0, max - 3).trimEnd() + "..."
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

function ensureShortTitleMaxWords(title: string, maxWords = 14) {
  const words = title.split(" ")
  if (words.length <= maxWords) return title
  return words.slice(0, maxWords).join(" ")
}

function ensureLongTitleCharRange(title: string, minChars = 135, maxChars = 140) {
  let t = title.trim()

  if (t.length > maxChars) {
    t = t.slice(0, maxChars)
    const lastSpace = t.lastIndexOf(" ")
    if (lastSpace > 60) t = t.slice(0, lastSpace)
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
      return wc >= 2 && wc <= 3
    })

  const result = clean.slice(0, 5)
  result.sort((a, b) => b.length - a.length)

  return result
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
You are an expert Etsy SEO copywriter.

Follow the product configuration strictly.

TITLE RULES
- Short title: max 14 words
- Long title: 135-140 characters
- Title Case
- Avoid filler words like cute, aesthetic, perfect

TAGS
- exactly 13
- max 20 characters
- multi-word phrases
- avoid duplicates

DESCRIPTION KEYWORDS
- choose exactly 5 keyword phrases
- each must be 2–3 words

ALT TEXT
- describe what the image shows
- 150–250 characters
- unique for each image

Return ONLY valid JSON.
`

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
{id:"",position:0,alt_text:""}
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
                text: `MOCKUP position=${img.position}`
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

    const shortTitle = ensureShortTitleMaxWords(
      titleCase(parsed.title_short_14_words),
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