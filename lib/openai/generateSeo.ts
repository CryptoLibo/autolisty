import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function generateSeo({
  images,
  productConfig,
  descriptionTemplate
}: {
  images: string[]
  productConfig: any
  descriptionTemplate: string
}) {

  const prompt = `
You are an Etsy SEO expert.

Generate a JSON response with the following fields:

title_short_14_words
title_long_135_140_chars
tags_13
description_keywords_5
description_final
media

Rules:

Short title:
- Max 14 words
- Capitalized
- Must include "${productConfig.required_keyword}"
- Must end with "(Digital Download)"

Long title:
- Between 135 and 140 characters

Tags:
- Exactly 13 tags
- Max 20 characters each

Alt text:
- Minimum 150 characters
- Describe the image naturally

Return ONLY valid JSON.
`

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: prompt
      },
      {
        role: "user",
        content: images.map(img => ({
          type: "image_url",
          image_url: {
            url: img
          }
        }))
      }
    ]
  })

  const content = response.choices[0].message.content

  if (!content) {
    throw new Error("OpenAI returned empty response")
  }

  return JSON.parse(content)
}