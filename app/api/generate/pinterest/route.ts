import OpenAI from "openai"

export const runtime = "nodejs"
export const maxDuration = 180

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

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

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      productType,
      listingTitle,
      listingDescription,
      listingKeywords = [],
      destinationLink,
      pins = [],
    } = body

    const systemPrompt = `
You are an expert Pinterest organic content strategist for digital decor products.

Your job is to create normal organic Pinterest pins that feel inspiring, searchable, and click-worthy.

WRITING GOALS
- Write like Pinterest content, not like Etsy listing copy.
- Focus on inspiration, decor ideas, visual appeal, and discoverability.
- Keep the tone organic and helpful, not aggressive or salesy.
- Make the user want to save the pin, click the link, or explore the design.

TITLE RULES
- Max 100 characters.
- Clear, specific, and attractive in feed.
- Use the strongest decor/search angle for the image.
- Avoid keyword stuffing.

DESCRIPTION RULES
- Max 800 characters.
- Use the listing context and keywords naturally.
- Write for organic discovery.
- Mention decor context, style, or use case when relevant.
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

destination_link:
${destinationLink}

Return JSON in this exact shape:
{
  "pins": [
    {
      "id": "",
      "title": "",
      "description": ""
    }
  ]
}
`

    const response = await client.responses.create({
      model: "gpt-5.4-mini",
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
            ...pins.flatMap((pin: any, index: number) => [
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

    const normalized = pins.map((pin: any, index: number) => {
      const found = generatedPins.find((item: any) => item.id === pin.id) || generatedPins[index] || {}

      return {
        id: pin.id,
        title: normalizePinTitle(found.title, listingTitle),
        description: normalizePinDescription(found.description),
      }
    })

    return Response.json({
      pins: normalized,
    })
  } catch (error: any) {
    console.error("PINTEREST GENERATION ERROR:", error)
    return new Response(error?.message || "Server error", { status: 500 })
  }
}
