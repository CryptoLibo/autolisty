import OpenAI from "openai"

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

export async function generateSeo({
  designImage,
  images,
  productConfig,
  descriptionTemplate,
  primaryKeywords,
  secondaryKeywords,
  contextInfo,
  competitorTitles,
  competitorTags
}: any) {

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
- KEYWORD_1 must be the strongest phrase

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
{id:"",order:0,position:0,alt_text:""}
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
          { type: "input_image", image_url: designImage },

          ...images.flatMap((img: any) => [
            {
              type: "input_text",
              text: `MOCKUP IMAGE id=${img.id} position=${img.position}`
            },
            {
              type: "input_image",
              image_url: img.dataUrl
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

  return parsed
}