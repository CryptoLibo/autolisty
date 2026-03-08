import OpenAI from "openai"

export const runtime = "nodejs"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

function clampAltText(text: string, min = 200, max = 250) {
  let t = (text || "").replace(/\s+/g, " ").trim()

  if (t.length > max) {
    t = t.slice(0, max)
    const last = t.lastIndexOf(" ")
    if (last > 120) t = t.slice(0, last)
  }

  if (t.length < min) {
    t = t.padEnd(min, ".")
  }

  return t
}

function ensureShortTitleMaxWords(title: string) {
  const words = title.split(/\s+/).filter(Boolean)

  if (words.length > 14) {
    return words.slice(0, 14).join(" ")
  }

  if (words.length < 13) {
    return title
  }

  return title
}

function ensureLongTitleCharRange(title: string, min = 135, max = 140) {
  let t = title.trim()

  if (t.length > max) {
    t = t.slice(0, max)
    const last = t.lastIndexOf(" ")
    if (last > 120) t = t.slice(0, last)
  }

  if (t.length < min) {
    t = t + " Digital Download"
  }

  return t
}

function normalizeTags(tags: string[]) {
  const out: string[] = []
  const seen = new Set<string>()

  for (let t of tags) {
    t = t.trim()

    if (t.length > 20) {
      t = t.slice(0, 20)
    }

    const key = t.toLowerCase()

    if (!seen.has(key) && t.length >= 3) {
      seen.add(key)
      out.push(t)
    }

    if (out.length === 13) break
  }

  return out
}

function normalizeKeywords5(list: string[]) {
  const cleaned = list
    .map((k) => k.trim())
    .filter((k) => k.split(" ").length >= 2)

  return cleaned.slice(0, 5)
}

export async function POST(req: Request) {
  const body = await req.json()

  const {
    productType,
    designUrl,
    primaryKeywords,
    secondaryKeywords,
    contextInfo,
    competitorTitles,
    competitorTags,
    mockups
  } = body

  const systemPrompt = `
You are an elite Etsy SEO strategist specialized in digital wall art.

Your goal is to create high-converting Etsy listings.

Always analyze images and keywords using this framework:

STYLE
SUBJECT
SCENE
CONTEXT

The final SEO must sound natural and premium, not keyword spam.

Rules:

SHORT TITLE
13–14 words exactly.

LONG TITLE
135–140 characters exactly.

Structure:
PRIMARY KEYWORDS + Frame TV Art + SECONDARY KEYWORDS + (Digital Download)

ALT TEXT
200–250 characters.

Describe:
- visual elements
- composition
- colors
- environment
- interior styling context

Integrate listing keywords naturally.

Never write generic filler.

DESCRIPTION KEYWORDS
Generate 5 phrases.

KEYWORD_1 must be strongest phrase and match main search intent.

Each keyword must contain at least two words.

TAGS
Generate exactly 13 Etsy tags.

Max 20 characters each.

Use multi-word phrases when possible.

Avoid duplicates.
`

  const userPrompt = `
PRIMARY KEYWORDS:
${primaryKeywords}

SECONDARY KEYWORDS:
${secondaryKeywords}

CONTEXT:
${contextInfo}

COMPETITOR TITLES:
${competitorTitles}

COMPETITOR TAGS:
${competitorTags}

MOCKUPS:
${mockups.map((m: any) => m.url).join("\n")}
`

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.6,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    response_format: { type: "json_object" }
  })

  const data = JSON.parse(completion.choices[0].message.content || "{}")

  const shortTitle = ensureShortTitleMaxWords(data.title_short_14_words)
  const longTitle = ensureLongTitleCharRange(data.title_long_135_140_chars)

  const tags = normalizeTags(data.tags_13 || [])

  const keywords = normalizeKeywords5(data.description_keywords_5 || [])

  const media = (data.media || []).map((m: any) => ({
    id: m.id,
    position: m.position,
    alt_text: clampAltText(m.alt_text)
  }))

  return Response.json({
    product_name: data.product_name,
    title_short_14_words: shortTitle,
    title_long_135_140_chars: longTitle,
    description_keywords_5: keywords,
    description_final: data.description_final,
    tags_13: tags,
    media
  })
}