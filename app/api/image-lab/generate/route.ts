import OpenAI from "openai"
import { normalizeProductType } from "@/lib/products"
import { ImageLabQuality, ImageLabSize } from "@/lib/r2/imageLab"

export const runtime = "nodejs"
export const maxDuration = 180

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

const IMAGE_MODEL = "gpt-image-2"

function cleanText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function normalizeQuality(value: unknown): ImageLabQuality {
  if (value === "low" || value === "high") return value
  return "medium"
}

function normalizeSize(value: unknown, productType: ReturnType<typeof normalizeProductType>): ImageLabSize {
  if (value === "1024x1024" || value === "1024x1536" || value === "1536x1024") return value
  if (productType === "horizontal_wall_art" || productType === "frame_tv_art") return "1536x1024"
  return "1024x1536"
}

function productPromptGuard(productType: ReturnType<typeof normalizeProductType>) {
  const base =
    "Create standalone finished artwork only. Do not create a mockup, frame, room scene, product display, poster sheet, wall preview, watermark, UI, or layout template."

  if (productType === "horizontal_wall_art" || productType === "frame_tv_art") {
    return `${base} Use a naturally wide composition with strong left-to-right visual flow.`
  }

  if (productType === "nursery_wall_art") {
    return `${base} Keep the image gentle, child-friendly, warm, calm, and suitable as standalone nursery artwork without showing a nursery room.`
  }

  return `${base} Use a strong vertical decorative composition with a clear subject and polished art finish.`
}

function buildPrompt(prompt: string, productType: ReturnType<typeof normalizeProductType>) {
  return `${prompt}\n\nProduction guard: ${productPromptGuard(productType)}`
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const productType = normalizeProductType(body?.productType)
    const quality = normalizeQuality(body?.quality)
    const size = normalizeSize(body?.size, productType)
    const prompts = Array.isArray(body?.prompts)
      ? body.prompts.map((prompt: unknown) => cleanText(prompt)).filter(Boolean).slice(0, 4)
      : []

    if (prompts.length === 0) {
      return Response.json({ error: "Add at least one prompt before generating images." }, { status: 400 })
    }

    const generated = []

    for (let index = 0; index < prompts.length; index += 1) {
      const prompt = prompts[index]
      const response = await client.images.generate({
        model: IMAGE_MODEL,
        prompt: buildPrompt(prompt, productType),
        n: 1,
        size,
        quality,
        output_format: "png",
      })

      const b64 = response.data?.[0]?.b64_json
      if (!b64) throw new Error("OpenAI did not return image data.")

      generated.push({
        id: `draft-${Date.now()}-${index}`,
        prompt,
        imageDataUrl: `data:image/png;base64,${b64}`,
        model: IMAGE_MODEL,
        quality,
        size,
      })
    }

    return Response.json({
      productType,
      images: generated,
    })
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "Failed to generate Image Lab images." },
      { status: 500 }
    )
  }
}
