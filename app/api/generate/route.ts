import OpenAI from "openai"
import fs from "fs"
import path from "path"

export const runtime = "nodejs"
export const maxDuration = 180

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

const REMOTE_IMAGE_TIMEOUT_MS = 30000
const REMOTE_IMAGE_MAX_RETRIES = 2

type ProductConfig = {
  product_name?: string
  title_rules?: {
    word_rules?: {
      min_words?: number
      max_words?: number
      max_characters?: number
      target_full_word_budget?: boolean
    }
    allow_variations?: string[]
  }
  normalization_rules?: {
    primary_product_term?: string
    alternate_product_terms?: string[]
    title_suffix?: string
    comma_after_product_term?: boolean
    title_format?: string
    keyword_fallback_phrases?: string[]
  }
  description_rules?: {
    template_file?: string
  }
  tag_rules?: {
    max_tags?: number
    max_characters?: number
  }
  image_rules?: {
    alt_text?: {
      min_characters?: number
      max_characters?: number
    }
  }
}

type ResolvedProductConfig = ProductConfig & {
  product_name: string
  description_rules: {
    template_file: string
  }
  tag_rules: {
    max_tags: number
    max_characters: number
  }
  image_rules: {
    alt_text: {
      min_characters: number
      max_characters: number
    }
  }
}

function cleanText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function toDataUrl(buffer: Buffer, mimeType: string) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`
}

async function fetchRemoteImageAsDataUrl(url: string, label: string) {
  const targetUrl = cleanText(url)

  if (!targetUrl) {
    throw new Error(`Missing image URL for ${label}.`)
  }

  let lastError: unknown = null

  for (let attempt = 1; attempt <= REMOTE_IMAGE_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REMOTE_IMAGE_TIMEOUT_MS)

    try {
      const response = await fetch(targetUrl, {
        cache: "no-store",
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`${response.status} while downloading ${targetUrl}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      const contentType = response.headers.get("content-type") || "image/jpeg"
      return toDataUrl(Buffer.from(arrayBuffer), contentType)
    } catch (error: any) {
      lastError = error

      if (attempt >= REMOTE_IMAGE_MAX_RETRIES) {
        if (error?.name === "AbortError") {
          throw new Error(`Timeout while downloading ${targetUrl}`)
        }

        throw new Error(error?.message || `Failed downloading ${label}`)
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new Error(
    lastError instanceof Error ? lastError.message : `Failed downloading ${label}`
  )
}

function resolveProductConfig(productConfig: ProductConfig): ResolvedProductConfig {
  const productName = cleanText(productConfig.product_name) || "Digital Product"
  const templateFile = cleanText(productConfig.description_rules?.template_file)

  if (!templateFile) {
    throw new Error(`Product config for "${productName}" is missing description_rules.template_file`)
  }

  return {
    ...productConfig,
    product_name: productName,
    description_rules: {
      template_file: templateFile,
    },
    tag_rules: {
      max_tags: productConfig.tag_rules?.max_tags ?? 13,
      max_characters: productConfig.tag_rules?.max_characters ?? 20,
    },
    image_rules: {
      alt_text: {
        min_characters: productConfig.image_rules?.alt_text?.min_characters ?? 200,
        max_characters: productConfig.image_rules?.alt_text?.max_characters ?? 250,
      },
    },
  }
}

function normalizeWord(value: string) {
  return cleanText(value).replace(/^[^\w]+|[^\w]+$/g, "")
}

function clampAltText(text: string, min = 200, max = 250) {
  let normalized = cleanText(text)

  if (normalized.length > max) {
    normalized = normalized.slice(0, max)
    const lastSpace = normalized.lastIndexOf(" ")
    if (lastSpace > Math.max(40, min - 20)) normalized = normalized.slice(0, lastSpace)
  }

  return normalized
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

function getTitleSuffix(productConfig: ProductConfig) {
  return cleanText(productConfig.normalization_rules?.title_suffix) || "(Digital Download)"
}

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function getProductTerms(productConfig: ProductConfig) {
  const preferred =
    cleanText(productConfig.normalization_rules?.primary_product_term) ||
    cleanText(productConfig.title_rules?.allow_variations?.[0]) ||
    cleanText(productConfig.product_name)

  const alternates = [
    ...(productConfig.normalization_rules?.alternate_product_terms || []),
    ...(productConfig.title_rules?.allow_variations || []),
    cleanText(productConfig.product_name),
  ]
    .map((item) => cleanText(item))
    .filter(Boolean)

  const allTerms = uniquePhrases([preferred, ...alternates])

  return {
    preferred,
    all: allTerms,
  }
}

function buildPrintableWallArtTitle(
  rawTitle: unknown,
  components: Record<string, unknown>,
  productConfig: ProductConfig,
  minWords: number,
  maxWords: number,
  maxCharacters: number
) {
  const suffix = getTitleSuffix(productConfig)
  const style = cleanText(components.style)
  const primary = cleanText(components.primary_subject)
  const secondary = cleanText(components.secondary_subject)
  const decorContext = cleanText(components.decor_context)
  const searchIntent = cleanText((components as any).search_intent)
  const mood = cleanText((components as any).mood)

  const bannedTitleWords = new Set([
    "art",
    "wall",
    "print",
    "digital",
    "download",
    "printable",
    "instant",
    "serene",
    "calm",
    "peaceful",
    "beautiful",
    "stunning",
    "elegant",
    "gorgeous",
    "interiors",
    "interior",
    "home",
    "decor",
  ])

  const weakLeadWords = new Set([
    "modern",
    "minimalist",
    "abstract",
    "coastal",
    "kitchen",
    "bathroom",
    "boho",
    "neutral",
    "botanical",
  ])

  const lowValueStyleWords = new Set([
    "modern",
    "minimalist",
    "abstract",
    "serene",
    "neutral",
  ])

  const cleanPhrase = (value: string) =>
    cleanText(
      value
        .replace(/\(([^)]*)\)/g, " ")
        .replace(/[,:;|/]+/g, " ")
        .replace(/\b(and|with|for|the|a|an)\b/gi, " ")
        .replace(/\s+/g, " ")
    )

  const buildKeywordPhrase = (value: string, maxWordsInPhrase = 4, allowLeadWeakWord = false) => {
    const words = cleanPhrase(value)
      .split(/\s+/)
      .map((word) => normalizeWord(word))
      .filter(Boolean)
      .filter((word) => !bannedTitleWords.has(word.toLowerCase()))

    let uniqueWords = uniquePhrases(words)
    const richerWords = uniqueWords.filter((word) => !lowValueStyleWords.has(word.toLowerCase()))
    if (richerWords.length > 0) {
      uniqueWords = richerWords
    }
    const trimmed = uniqueWords.slice(0, maxWordsInPhrase)

    while (
      trimmed.length > 1 &&
      (!allowLeadWeakWord && weakLeadWords.has(trimmed[0].toLowerCase()))
    ) {
      trimmed.shift()
    }

    while (
      trimmed.length > 1 &&
      weakLeadWords.has(trimmed[trimmed.length - 1].toLowerCase())
    ) {
      trimmed.pop()
    }

    return trimmed.join(" ")
  }

  const subjectPhrase = uniquePhrases(
    [
      buildKeywordPhrase(primary, 4, true),
      buildKeywordPhrase(secondary, 3, true),
      buildKeywordPhrase(searchIntent, 3, true),
    ].filter(Boolean)
  )
    .join(" ")
    .trim()

  const stylePhrase = uniquePhrases(
    [
      buildKeywordPhrase(style, 2, true),
      buildKeywordPhrase(decorContext, 2, false),
      buildKeywordPhrase(searchIntent, 2, false),
      buildKeywordPhrase(mood, 1, false),
    ].filter(Boolean)
  )
    .join(" ")
    .trim()

  let printableSubject = subjectPhrase || buildKeywordPhrase(cleanText(rawTitle), 4, true) || "Abstract"
  let printableStyle = stylePhrase || "Modern"
  let decorPhrase = uniquePhrases(
    [
      buildKeywordPhrase(decorContext, 2, true),
      buildKeywordPhrase(searchIntent, 2, true),
    ].filter(Boolean)
  )
    .join(" ")
    .trim()

  const chooseDecorFormat = (() => {
    const seed = cleanText(`${primary} ${secondary} ${style} ${decorContext} ${searchIntent}`)
      .split("")
      .reduce((sum, char) => sum + char.charCodeAt(0), 0)
    return !!decorPhrase && seed % 2 === 0
  })()

  const buildCandidate = (subjectPart: string, stylePart: string, decorPart = "") =>
    chooseDecorFormat && decorPart
      ? `${subjectPart} Print, ${decorPart} Decor, ${stylePart} Wall Art (${suffix})`
      : `${subjectPart} Print, ${stylePart} Wall Art (${suffix})`
      .replace(/\s+/g, " ")
      .replace(/\s+,/g, ",")
      .trim()

  const countWords = (value: string) =>
    value
      .replace(/[(),]/g, "")
      .split(/\s+/)
      .filter(Boolean).length

  const addPhraseIfFits = (segment: "subject" | "style" | "decor", phrase: string) => {
    const cleanExtra = cleanText(phrase)
    if (!cleanExtra) return false

    const nextSubject = segment === "subject"
      ? uniquePhrases(`${printableSubject} ${cleanExtra}`.split(/\s+/).filter(Boolean)).join(" ")
      : printableSubject
    const nextStyle = segment === "style"
      ? uniquePhrases(`${printableStyle} ${cleanExtra}`.split(/\s+/).filter(Boolean)).join(" ")
      : printableStyle
    const nextDecor = segment === "decor"
      ? uniquePhrases(`${decorPhrase} ${cleanExtra}`.split(/\s+/).filter(Boolean)).join(" ")
      : decorPhrase

    const candidate = buildCandidate(nextSubject, nextStyle, nextDecor)
    if (countWords(candidate) > maxWords || candidate.length > maxCharacters) {
      return false
    }

    printableSubject = nextSubject
    printableStyle = nextStyle
    decorPhrase = nextDecor
    normalized = candidate
    return true
  }

  let normalized = buildCandidate(printableSubject, printableStyle, decorPhrase)

  normalized = normalized
    .split(/\s+/)
    .map((word) => titleCase(word))
    .join(" ")
    .replace(/\s+,/g, ",")
    .trim()

  const fallbackStyleTerms = uniquePhrases(
    [
      buildKeywordPhrase(style, 2, true),
      buildKeywordPhrase(decorContext, 2, false),
      buildKeywordPhrase(searchIntent, 2, false),
      "Modern",
    ].filter(Boolean)
  )

  for (const extra of fallbackStyleTerms) {
    const candidateStyle = uniquePhrases([printableStyle, extra]).join(" ").trim()
    const candidate = buildCandidate(printableSubject, candidateStyle, decorPhrase)
    const candidateWords = countWords(candidate)
    if (candidateWords <= maxWords && candidate.length <= maxCharacters) {
      printableStyle = candidateStyle
      normalized = candidate
    }
  }

  const subjectExpansionPool = uniquePhrases(
    [
      buildKeywordPhrase(secondary, 2, true),
      buildKeywordPhrase(searchIntent, 2, true),
      buildKeywordPhrase(cleanText(rawTitle), 2, true),
    ].filter(Boolean)
  ).filter((phrase) => {
    const lower = phrase.toLowerCase()
    return lower && !printableSubject.toLowerCase().includes(lower)
  })

  const styleExpansionPool = uniquePhrases(
    [
      buildKeywordPhrase(decorContext, 2, true),
      buildKeywordPhrase(searchIntent, 2, true),
      buildKeywordPhrase(style, 2, true),
      buildKeywordPhrase(mood, 1, false),
      "Digital",
    ].filter(Boolean)
  ).filter((phrase) => {
    const lower = phrase.toLowerCase()
    return lower && !printableStyle.toLowerCase().includes(lower)
  })

  const decorExpansionPool = uniquePhrases(
    [
      buildKeywordPhrase(decorContext, 2, true),
      buildKeywordPhrase(searchIntent, 2, true),
      "Home",
    ].filter(Boolean)
  ).filter((phrase) => {
    const lower = phrase.toLowerCase()
    return lower && !decorPhrase.toLowerCase().includes(lower)
  })

  while (countWords(normalized) < minWords) {
    const currentCount = countWords(normalized)
    let changed = false

    if (currentCount <= maxWords - 2) {
      const nextSubjectPhrase = subjectExpansionPool.shift()
      if (nextSubjectPhrase) {
        changed = addPhraseIfFits("subject", nextSubjectPhrase)
      }
    }

    if (!changed) {
      const nextStylePhrase = styleExpansionPool.shift()
      if (nextStylePhrase) {
        changed = addPhraseIfFits("style", nextStylePhrase)
      }
    }

    if (!changed && chooseDecorFormat) {
      const nextDecorPhrase = decorExpansionPool.shift()
      if (nextDecorPhrase) {
        changed = addPhraseIfFits("decor", nextDecorPhrase)
      }
    }

    if (!changed) break
  }

  normalized = normalized
    .split(/\s+/)
    .map((word) => titleCase(word))
    .join(" ")
    .replace(/\s+,/g, ",")
    .trim()

  if (normalized.length > maxCharacters) {
    return normalized.slice(0, maxCharacters).replace(/\s+\S*$/, "").trim()
  }

  return normalized
}

function normalizeTitle(
  rawTitle: unknown,
  productConfig: ProductConfig,
  components: Record<string, unknown>,
  minWords = 13,
  maxWords = 15,
  maxCharacters = 140
) {
  if (productConfig.normalization_rules?.title_format === "print_wall_art_commas") {
    return buildPrintableWallArtTitle(
      rawTitle,
      components,
      productConfig,
      minWords,
      maxWords,
      maxCharacters
    )
  }

  let title = cleanText(rawTitle).replace(/\s+,/g, ",")

  if (!title) return ""

  const suffix = getTitleSuffix(productConfig)
  const productTerms = getProductTerms(productConfig)

  title = titleCase(title)

  const suffixPattern = new RegExp(`${escapeRegex(suffix)}$`, "i")

  if (!suffixPattern.test(title)) {
    title = title.replace(/\s*\([^)]*\)\s*$/i, "").trim()
    title += ` ${suffix}`
  }

  const hasProductTerm = productTerms.all.some((term) => {
    const pattern = new RegExp(escapeRegex(term), "i")
    return pattern.test(title)
  })

  if (!hasProductTerm && productTerms.preferred) {
    title = `${title.replace(suffixPattern, "").trim()} ${productTerms.preferred} ${suffix}`.trim()
  }

  const withoutSuffix = title.replace(suffixPattern, "").trim()

  let prefix = withoutSuffix
  if (prefix.includes(",")) {
    const firstComma = prefix.indexOf(",")
    const before = prefix.slice(0, firstComma).trim()
    const after = prefix.slice(firstComma + 1).replace(/,/g, "").trim()
    prefix = `${before}, ${after}`.trim()
  } else if (productConfig.normalization_rules?.comma_after_product_term) {
    for (const term of productTerms.all) {
      const pattern = new RegExp(escapeRegex(term), "i")
      if (pattern.test(prefix)) {
        prefix = prefix.replace(pattern, (match) => `${match},`)
        break
      }
    }
  }

  prefix = prefix.replace(/,+/g, ",").replace(/\s+,/g, ",").replace(/,\s*,/g, ",")
  prefix = prefix.replace(/,\s*$/, "").trim()

  let words = dedupeWordRoots(prefix.split(/\s+/).filter(Boolean))
  const suffixWords = suffix.replace(/[()]/g, "").split(/\s+/).filter(Boolean).length

  if (words.length > maxWords - suffixWords) {
    words = words.slice(0, maxWords - suffixWords)
  }

  let normalized = `${words.join(" ")} ${suffix}`.replace(/\s+/g, " ").trim()

  const commaCount = (normalized.match(/,/g) || []).length
  if (commaCount === 0 && productConfig.normalization_rules?.comma_after_product_term) {
    for (const term of productTerms.all) {
      const pattern = new RegExp(escapeRegex(term), "i")
      if (pattern.test(normalized)) {
        normalized = normalized.replace(pattern, (match) => `${match},`)
        break
      }
    }
  } else if (commaCount > 1) {
    let usedComma = false
    normalized = normalized.replace(/,/g, () => {
      if (usedComma) return ""
      usedComma = true
      return ","
    })
  }

  normalized = normalized.replace(/\s+/g, " ").trim()
  normalized = normalized.replace(/\s+/g, " ").trim()

  const finalWords = normalized
    .replace(/[(),]/g, "")
    .split(/\s+/)
    .filter(Boolean)

  if (finalWords.length > maxWords) {
    const parts = normalized
      .replace(suffixPattern, "")
      .trim()
      .split(/\s+/)
    const allowed = Math.max(minWords, maxWords - suffixWords)
    normalized = `${parts.slice(0, allowed).join(" ")} ${suffix}`.replace(/\s+/g, " ").trim()
  }

  if (normalized.length > maxCharacters) {
    normalized = normalized.slice(0, maxCharacters).replace(/\s+\S*$/, "").trim()
  }

  return normalized
}

function normalizeTags(tags: unknown, maxTags = 13, maxChars = 20) {
  const values = Array.isArray(tags) ? tags : []
  const seen = new Set<string>()
  const result: string[] = []

  for (const tag of values) {
    let clean = cleanText(tag)
    if (!clean) continue

    if (clean.length > maxChars) {
      const truncated = clean.slice(0, maxChars)
      const lastSpace = truncated.lastIndexOf(" ")
      clean = lastSpace > 0 ? truncated.slice(0, lastSpace) : ""
    }

    clean = cleanText(clean)
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

function normalizeKeywords5(
  list: unknown,
  analysis: Record<string, unknown>,
  productConfig: ProductConfig,
  title: string
) {
  const requested = Array.isArray(list) ? list : []
  const titlePhrases = cleanText(title)
    .split(",")
    .map((item) => cleanText(item))
    .filter(Boolean)
  const searchPhrases = Array.isArray(analysis.search_phrases)
    ? analysis.search_phrases.map((item) => cleanText(item))
    : []

  const fallback = [
    ...titlePhrases,
    ...searchPhrases,
    cleanText(analysis.search_intent),
    cleanText(analysis.primary_subject) && `${cleanText(analysis.primary_subject)} artwork`,
    cleanText(analysis.style) && `${cleanText(analysis.style)} wall art`,
    cleanText(analysis.decor_context) && `${cleanText(analysis.decor_context)} decor`,
    ...(productConfig.normalization_rules?.keyword_fallback_phrases || []),
  ].filter(Boolean) as string[]

  const normalized = uniquePhrases(
    [...requested.map((item) => cleanText(item)), ...fallback].filter(
      (phrase) => {
        const words = phrase.split(" ").filter(Boolean)
        return words.length >= 2 && words.length <= 4
      }
    )
  ).slice(0, 5)

  if (titlePhrases[0] && !normalized.some((item) => item.toLowerCase() === titlePhrases[0].toLowerCase())) {
    return uniquePhrases([titlePhrases[0], ...normalized]).slice(0, 5)
  }

  return normalized
}

function fillTemplate(template: string, keywords5: string[]) {
  let output = template

  for (let i = 0; i < 5; i++) {
    output = output.replaceAll(`KEYWORD_${i + 1}`, keywords5[i] || "")
  }

  return output
}

function appendListingId(description: string, listingId: string | null) {
  const cleanListingId = cleanText(listingId)
  if (!cleanListingId) return description

  const shortCode = cleanListingId.split("-").pop() || cleanListingId
  const marker = cleanText(shortCode)
  const normalized = description.trim()

  if (!normalized) return marker
  if (normalized.includes(marker)) return normalized

  return `${normalized}\n\n${marker}`
}

async function rewriteTitleAndAltTexts({
  productConfig,
  listingTitle,
  analysis,
  mediaDrafts,
}: {
  productConfig: ProductConfig
  listingTitle: string
  analysis: Record<string, unknown>
  mediaDrafts: Array<{
    id: string
    position: number
    alt_text: string
  }>
}) {
  if (mediaDrafts.length === 0) {
    return {
      title: listingTitle,
      media: mediaDrafts,
    }
  }

  const minAlt = productConfig?.image_rules?.alt_text?.min_characters ?? 200
  const maxAlt = productConfig?.image_rules?.alt_text?.max_characters ?? 250

  const systemPrompt = `
You are polishing an Etsy listing title and rewriting Etsy listing image alt text for a digital art product.

YOUR TITLE GOAL
- Keep the original title strategy and search intent intact.
- Improve coherence, readability, and phrasing.
- Remove awkward redundancy and clumsy wording.
- Do not turn the title into a completely new title.
- Preserve the product type and overall keyword intent.
- For printable wall art, avoid redundant constructions such as "Printable Print".
- Keep the title commercially strong, polished, and natural.

YOUR GOAL
- Rewrite each alt text so it sounds fully natural, human, and coherent.
- Describe what is actually visible in the image.
- Integrate relevant listing keywords naturally, without stuffing.
- Make each image sound unique.

STRICT RULES
- Each alt text must be between ${minAlt} and ${maxAlt} characters.
- Do not append keyword fragments or keyword lists.
- Do not repeat the exact same keyword phrase across every image.
- Use complete sentences or one coherent sentence only.
- Keep the original image id and position exactly.
- Preserve image-specific differences such as framed mockup, room scene, promo graphic, size guide, or tabletop styling.

OUTPUT
- Return ONLY valid JSON.
- Do not add markdown.
- Do not add commentary.
  `

  const userPrompt = `
product_config:
${JSON.stringify(productConfig)}

listing_title:
${listingTitle}

listing_analysis:
${JSON.stringify(analysis)}

Polish the title and rewrite the following alt text drafts into polished final alt text:
${JSON.stringify(mediaDrafts)}

Return JSON in this exact shape:
{
  "title": "",
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
        content: [{ type: "input_text", text: userPrompt }],
      },
    ],
  })

  const raw = response.output_text || ""
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")

  if (start === -1 || end === -1) {
    return {
      title: listingTitle,
      media: mediaDrafts,
    }
  }

  const parsed = JSON.parse(raw.slice(start, end + 1))
  const rewrittenMedia = Array.isArray(parsed.media) ? parsed.media : []
  const polishedTitle = cleanText(parsed.title) || listingTitle

  return {
    title: polishedTitle,
    media: mediaDrafts.map((draft) => {
      const found =
        rewrittenMedia.find((entry: any) => entry.id === draft.id) ||
        rewrittenMedia.find((entry: any) => entry.position === draft.position)

      return {
        ...draft,
        alt_text: clampAltText(found?.alt_text || draft.alt_text || "", minAlt, maxAlt),
      }
    }),
  }
}

function buildTitleFromComponents(
  components: Record<string, unknown>,
  productConfig: ProductConfig
) {
  const suffix = getTitleSuffix(productConfig)
  const productTerm =
    cleanText(components.product_term) ||
    getProductTerms(productConfig).preferred ||
    cleanText(productConfig.product_name)

  const parts = [
    cleanText(components.style),
    cleanText(components.primary_subject),
    cleanText(components.secondary_subject),
    productTerm,
  ].filter(Boolean)

  const decorContext = cleanText(components.decor_context)

  const prefix = decorContext ? `${parts.join(" ")}, ${decorContext}` : parts.join(" ")
  return `${prefix} ${suffix}`.replace(/\s+/g, " ").trim()
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const { productType, designUrl, mockups = [], midjourneyPrompt, listingId } = body

    const configPath = path.join(process.cwd(), "product_configs", `${productType}.json`)
    const rawProductConfig = JSON.parse(fs.readFileSync(configPath, "utf-8")) as ProductConfig
    const productConfig = resolveProductConfig(rawProductConfig)

    const templatePath = path.join(
      process.cwd(),
      "templates",
      productConfig.description_rules.template_file
    )
    const descriptionTemplate = fs.readFileSync(templatePath, "utf-8")

    const designDataUrl = await fetchRemoteImageAsDataUrl(designUrl, "primary design image")
    const mockupInputs = await Promise.all(
      mockups.map(async (img: any) => ({
        id: img.id,
        position: img.position,
        dataUrl: await fetchRemoteImageAsDataUrl(
          img.url,
          `mockup ${img.position || img.id || "image"}`
        ),
      }))
    )

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
- If the product rules require a full word budget, use as much of that allowed budget as possible without breaking coherence.
- For printable wall art, think in 3 clear blocks: subject cluster ending in "Print", style/decor cluster ending in "Wall Art", and a final "(Digital Download)" suffix.

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
- Obey the product-specific alt text character range strictly.
- Rotate keyword emphasis across images instead of repeating the exact same product phrase every time.

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
    const responseContent = [
      { type: "input_text" as const, text: userPrompt },
      { type: "input_text" as const, text: "PRIMARY DESIGN IMAGE" },
      { type: "input_image" as const, image_url: designDataUrl, detail: "auto" as const },
      ...mockupInputs.flatMap((img: any) => [
        {
          type: "input_text" as const,
          text: `LISTING IMAGE position=${img.position} id=${img.id}`,
        },
        {
          type: "input_image" as const,
          image_url: img.dataUrl,
          detail: "auto" as const,
        },
      ]),
    ]

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
          content: responseContent,
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
      productConfig,
      parsed.title_components || {},
      productConfig?.title_rules?.word_rules?.min_words ?? 13,
      productConfig?.title_rules?.word_rules?.max_words ?? 15,
      productConfig?.title_rules?.word_rules?.max_characters ?? 140
    )
    const tags = normalizeTags(
      parsed.tags_13,
      productConfig.tag_rules.max_tags,
      productConfig.tag_rules.max_characters
    )
    const keywords5 = normalizeKeywords5(parsed.description_keywords_5, analysis, productConfig, title)
    const description = appendListingId(
      fillTemplate(descriptionTemplate, keywords5),
      listingId
    )

    const parsedMedia = Array.isArray(parsed.media) ? parsed.media : []
    const mediaDrafts = mockups.map((img: any, index: number) => {
      const foundById = parsedMedia.find((entry: any) => entry.id === img.id)
      const foundByPosition = parsedMedia.find(
        (entry: any) => entry.position === img.position
      )
      const found = foundById || foundByPosition
      const minAlt = productConfig.image_rules.alt_text.min_characters
      const maxAlt = productConfig.image_rules.alt_text.max_characters

      return {
        id: img.id,
        position: img.position,
        alt_text: clampAltText(found?.alt_text || "", minAlt, maxAlt),
      }
    })

    const polished = await rewriteTitleAndAltTexts({
      productConfig,
      listingTitle: title,
      analysis,
      mediaDrafts,
    })

    const polishedTitle = normalizeTitle(
      polished.title,
      productConfig,
      parsed.title_components || {},
      productConfig?.title_rules?.word_rules?.min_words ?? 13,
      productConfig?.title_rules?.word_rules?.max_words ?? 15,
      productConfig?.title_rules?.word_rules?.max_characters ?? 140
    )

    const output = {
      title: polishedTitle,
      description_keywords_5: keywords5,
      description_final: description,
      tags_13: tags,
      media: polished.media,
    }

    return new Response(JSON.stringify(output), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (err: any) {
    console.error("API ERROR:", err)
    return new Response(err.message || "Server error", { status: 500 })
  }
}
