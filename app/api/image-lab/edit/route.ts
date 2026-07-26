import OpenAI, { toFile } from "openai"
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

function parseImageDataUrl(value: unknown) {
  const dataUrl = String(value || "")
  const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([\s\S]+)$/)
  if (!match) return null
  const ext = match[1] === "jpeg" ? "jpg" : match[1]
  return {
    buffer: Buffer.from(match[2], "base64"),
    filename: `image-lab-source.${ext}`,
    contentType: `image/${match[1]}`,
  }
}

async function fetchImageFromUrl(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error("Failed to load source image for editing.")
  const contentType = response.headers.get("content-type") || "image/png"
  const ext = contentType.includes("webp") ? "webp" : contentType.includes("jpeg") ? "jpg" : "png"

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    filename: `image-lab-source.${ext}`,
    contentType,
  }
}

function editPrompt(instruction: string) {
  return [
    instruction,
    "Keep the original artwork style, composition logic, visual polish, and commercial design quality unless the instruction explicitly asks to change them.",
    "Return standalone finished artwork only. Do not create a mockup, frame, product display, watermark, or room scene.",
    "If correcting text, make the requested text exact, legible, and clean.",
  ].join("\n")
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const productType = normalizeProductType(body?.productType)
    const instruction = cleanText(body?.instruction)
    const quality = normalizeQuality(body?.quality)
    const size = normalizeSize(body?.size, productType)

    if (!instruction) {
      return Response.json({ error: "Add an edit instruction first." }, { status: 400 })
    }

    const parsedDataUrl = parseImageDataUrl(body?.imageDataUrl)
    const source =
      parsedDataUrl ||
      (cleanText(body?.imageUrl) ? await fetchImageFromUrl(cleanText(body.imageUrl)) : null)

    if (!source) {
      return Response.json({ error: "Select an image to edit first." }, { status: 400 })
    }

    const file = await toFile(source.buffer, source.filename, {
      type: source.contentType,
    })

    const response = await client.images.edit({
      model: IMAGE_MODEL,
      image: file,
      prompt: editPrompt(instruction),
      n: 1,
      size,
      quality,
      output_format: "png",
      input_fidelity: "high",
    })

    const b64 = response.data?.[0]?.b64_json
    if (!b64) throw new Error("OpenAI did not return edited image data.")

    return Response.json({
      image: {
        id: `edit-${Date.now()}`,
        prompt: cleanText(body?.prompt),
        editInstruction: instruction,
        imageDataUrl: `data:image/png;base64,${b64}`,
        model: IMAGE_MODEL,
        quality,
        size,
        source: "edit",
        parentImageLabId: cleanText(body?.parentImageLabId) || undefined,
      },
    })
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "Failed to edit Image Lab image." },
      { status: 500 }
    )
  }
}
