// Textos de los pines de Pinterest. Lo usan la ruta manual y el flujo automático.
import OpenAI from "openai"
import { recordOpenAiUsage } from "./openaiUsage"


const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  // Tiempo máximo explícito por llamada (E3) y pocos reintentos del propio SDK.
  timeout: 180_000,
  maxRetries: 2,
})

/** Llamada a OpenAI que anota tokens y coste en el trabajo en curso. */
async function createResponse(params: OpenAI.Responses.ResponseCreateParamsNonStreaming) {
  const response = await client.responses.create(params)
  recordOpenAiUsage(response.usage)
  return response
}

function cleanText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function normalizePinTitle(title: unknown, fallback: string) {
  const base = cleanText(title) || fallback
  return base.slice(0, 100).trim()
}

function normalizePinDescription(description: unknown) {
  return cleanText(description).slice(0, 800).trim()
}

export type GeneratePinterestCopyInput = {
  productType: string
  listingTitle: string
  listingDescription: string
  listingKeywords?: string[]
  /** Tags actuales del listing en Etsy. */
  listingTags?: string[]
  /** Indicación tras un intento con títulos demasiado parecidos. */
  feedback?: string
  destinationLink: string
  pins: Array<{ id: string; url: string }>
}

export type PinterestCopy = { id: string; title: string; description: string; keyword?: string }

export async function generatePinterestCopy(body: GeneratePinterestCopyInput): Promise<{ pins: PinterestCopy[] }> {
  {
    const {
      productType,
      listingTitle,
      listingDescription,
      listingKeywords = [],
      listingTags = [],
      feedback,
      destinationLink,
      pins = [],
    } = body

    const systemPrompt = `
You are an expert Pinterest organic content strategist for digital creative products.

Your job is to create normal organic Pinterest pins that feel inspiring, searchable, and click-worthy.

WRITING GOALS
- Write like Pinterest content, not like Etsy listing copy.
- Focus on inspiration, decor ideas, visual appeal, and discoverability.
- Keep the tone organic and helpful, not aggressive or salesy.
- Make the user want to save the pin, click the link, or explore the design.
- When product_type is png_designs, focus on the visible phrase or subject, niche, audience, creative project ideas, apparel inspiration, and finished physical-product uses. Do not describe it as wall decor unless the image genuinely shows that use.
- When product_type is png_designs, make it clear that the listing is a reusable PNG design without presenting a T-shirt as the only possible use.

SEARCH INTENT (most important)
- Pinterest is a visual search engine: each title answers something people actually search for.
- The pins of one listing are published on different days and compete for different searches.
- Give EACH pin a DIFFERENT target search phrase taken from listing_keywords / listing_tags
  (or a close, natural variation of them). Never use the same phrase for two pins.
- Example for a stag painting: pin 1 "stag painting", pin 2 "red deer in snow", pin 3 "winter stag".

TITLE RULES
- Max 100 characters.
- Lead with that pin's target search phrase, then a natural decor/use angle.
- The three titles must be clearly different: never the same title, and never the same first three words.
- Same SEO logic for all three: specific, searchable, attractive in feed.
- Avoid keyword stuffing and avoid brand names.

DESCRIPTION RULES
- Max 800 characters.
- Built around that pin's target search phrase, plus one or two related phrases.
- Different wording from the other pins' descriptions.
- Use the listing context and keywords naturally.
- Write for organic discovery.
- Mention decor context, style, creative niche, audience, or physical-product use case when relevant.
- Light CTA is allowed, but keep it soft.

IMAGE RULES
- Each pin image must get unique copy based on what is visually shown.
- Use the image plus listing context together.
- If the image is more promotional or text-driven, adapt the copy accordingly.

OUTPUT
- Return ONLY valid JSON.
- Do not add markdown.
- Do not add commentary.
`

    const userPrompt = `
product_type:
${productType}

listing_title:
${listingTitle}

listing_description:
${listingDescription}

listing_keywords:
${JSON.stringify(listingKeywords)}

listing_tags:
${JSON.stringify(listingTags)}
${feedback ? `\nFIX FROM PREVIOUS ATTEMPT:\n${feedback}\n` : ""}
destination_link:
${destinationLink}

Return JSON in this exact shape:
{
  "pins": [
    {
      "id": "",
      "keyword": "",
      "title": "",
      "description": ""
    }
  ]
}
`

    const response = await createResponse({
      model: "gpt-5.4-mini",
      text: { format: { type: "json_object" } },
      temperature: 0.4,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }],
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: userPrompt },
            ...(pins as any).flatMap((pin: any, index: number) => [
              {
                type: "input_text",
                text: `PINTEREST IMAGE id=${pin.id} position=${index + 1}`,
              },
              {
                type: "input_image",
                image_url: pin.url,
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
    const generatedPins = Array.isArray(parsed.pins) ? parsed.pins : []

    const normalized = (pins as any[]).map((pin: any, index: number) => {
      const found = generatedPins.find((item: any) => item.id === pin.id) || generatedPins[index] || {}

      return {
        id: pin.id,
        title: normalizePinTitle(found.title, listingTitle),
        description: normalizePinDescription(found.description),
        keyword: cleanText(found.keyword).slice(0, 100) || undefined,
      }
    })

    return { pins: normalized }
  }
}
