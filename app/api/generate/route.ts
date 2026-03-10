import OpenAI from "openai"
import fs from "fs"
import path from "path"

export const runtime = "nodejs"
export const maxDuration = 180

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

function clampAltText(text: string, min = 200, max = 250) {
  let t = String(text || "").replace(/\s+/g, " ").trim()

  if (t.length > max) {
    t = t.slice(0, max)
    const lastSpace = t.lastIndexOf(" ")
    if (lastSpace > 140) t = t.slice(0, lastSpace)
  }

  if (t.length < min) {
    return t
  }

  return t
}

function titleCase(input: string) {
  return String(input || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const clean = word.trim()

      if (!clean) return clean

      const upper = clean.toUpperCase()

      if (upper === "TV") return "TV"
      if (upper === "AI") return "AI"

      if (clean.startsWith("(") && clean.endsWith(")")) {
        const inner = clean.slice(1, -1)
        if (inner.toUpperCase() === "DIGITAL DOWNLOAD") {
          return "(Digital Download)"
        }
      }

      if (clean.includes("-")) {
        return clean
          .split("-")
          .map((part) => {
            if (!part) return part
            if (part.toUpperCase() === "TV") return "TV"
            return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
          })
          .join("-")
      }

      return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase()
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

function normalizeTitle(rawTitle: any, minWords = 13, maxWords = 15) {
  let title = String(rawTitle || "")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .trim()

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

  title = title.replace(/\s+/g, " ").trim()

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

  let words = prefix.split(/\s+/).filter(Boolean)
  words = dedupeWordRoots(words)

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
    normalized = normalized.replace(/\s+/g, " ").replace(/\s+,/g, ",").trim()
  }

  normalized = normalized.replace(/\s+\(Digital Download\)$/i, " (Digital Download)")
  normalized = normalized.replace(/\s+/g, " ").trim()

  const finalWords = normalized
    .replace(/[(),]/g, "")
    .split(/\s+/)
    .filter(Boolean)

  if (finalWords.length > maxWords) {
    const parts = normalized.replace(/\s*\(Digital Download\)$/i, "").trim().split(/\s+/)
    const allowed = Math.max(minWords, maxWords - 2)
    normalized = `${parts.slice(0, allowed).join(" ")} (Digital Download)`.replace(/\s+/g, " ").trim()
  }

  return normalized
}

function normalizeTags(tags: any, maxTags = 13, maxChars = 20) {
  const arr = Array.isArray(tags) ? tags : []

  const clean = arr
    .map((x) => String(x).trim())
    .filter(Boolean)
    .map((x) => x.replace(/\s+/g, " "))
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
    .filter((x) => x.split(" ").length >= 2)
    .slice(0, 5)

  return clean
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
You are an elite Etsy SEO strategist specialized in Samsung Frame TV digital art listings.

Your job is to generate optimized Etsy SEO content using:
- user keywords
- style keywords
- visual analysis of the artwork
- visual analysis of each uploaded image

First analyze the design image and identify:
- STYLE
- MAIN SUBJECT
- SECONDARY SUBJECT
- ART CATEGORY
- DECOR CONTEXT
- MOOD

Then generate Etsy SEO output.

TITLE RULES
- Generate ONE title only
- Title must contain 13 to 15 words total
- Use Title Case so every word starts with a capital letter
- Avoid repeated word roots and filler words
- Use exactly ONE comma
- The comma must appear immediately after "Frame TV Art" or "Samsung Frame TV Art"
- The title must always end with "(Digital Download)"
- Prefer strong keyword coverage without making the title look stuffed
- Structure:
  STYLE + SUBJECT + SECOND SUBJECT + PRODUCT, DECOR CONTEXT (Digital Download)
- PRODUCT can be either "Frame TV Art" or "Samsung Frame TV Art"

TAG RULES
- Generate exactly 13 tags
- Each tag must be max 20 characters
- Prefer multi-word phrases
- Avoid duplicates
- Avoid excessive reuse of the same root word
- Distribute tags across semantic categories:
  3 product type
  3 style
  3 subject
  2 decor context
  2 digital format

DESCRIPTION KEYWORDS RULES
- Generate exactly 5 keyword phrases
- Each phrase must contain 2 to 4 words
- The phrases must fit naturally inside the provided description template
- Use these roles:
  KEYWORD_1 = main search phrase
  KEYWORD_2 = artwork phrase
  KEYWORD_3 = visual style phrase
  KEYWORD_4 = decor intent phrase
  KEYWORD_5 = digital art phrase

ALT TEXT RULES
- Generate alt text for each uploaded image
- First identify the image type:
  mockup
  close-up
  informational
  promotional
- Then describe what is visually shown in the image
- Integrate product keywords naturally only when relevant
- Do not force the same keyword pattern into every image
- If an image is informational or promotional, describe its content accurately instead of inventing decor context
- Each alt text must be unique
- Each alt text must be 200 to 250 characters
- Describe exactly what is visible, including distance, framing, room scene, close-up details, informational content, offer banners, or compatibility graphics when present

OUTPUT
- Return ONLY valid JSON
- Do not add markdown
- Do not add commentary
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

IMPORTANT IMAGE MAPPING RULES:
- Use the exact mockup id provided
- Do NOT invent, rename, omit, or reorder ids
- Each uploaded image must appear exactly once in media
- Keep the exact position value provided for each image

Return JSON in this exact shape:

{
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
      temperature: 0.25,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }]
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: userPrompt },
            { type: "input_text", text: "DESIGN IMAGE" },
            { type: "input_image", image_url: designUrl },
            ...mockups.flatMap((img: any) => [
              {
                type: "input_text",
                text: `LISTING IMAGE position=${img.position} id=${img.id}`
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

    const title = normalizeTitle(parsed.title, 13, 15)
    const tags = normalizeTags(parsed.tags_13)
    const keywords5 = normalizeKeywords5(parsed.description_keywords_5)
    const description = fillTemplate(descriptionTemplate, keywords5)

    const parsedMedia = Array.isArray(parsed.media) ? parsed.media : []

    const media = mockups.map((img: any) => {
      const foundById = parsedMedia.find((m: any) => m.id === img.id)
      const foundByPosition = parsedMedia.find((m: any) => m.position === img.position)
      const found = foundById || foundByPosition

      return {
        id: img.id,
        position: img.position,
        alt_text: clampAltText(found?.alt_text || "")
      }
    })

    const output = {
      title,
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