import { normalizeProductType } from "@/lib/products"
import {
  ImageLabQuality,
  ImageLabSize,
  putImageLabApprovedImage,
} from "@/lib/r2/imageLab"

export const runtime = "nodejs"
export const maxDuration = 120

function cleanText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function parseImageDataUrl(value: unknown) {
  const dataUrl = String(value || "")
  const match = dataUrl.match(/^data:image\/(?:png|jpeg|webp);base64,([\s\S]+)$/)
  if (!match) throw new Error("Missing a valid generated image.")
  return Buffer.from(match[1], "base64")
}

function normalizeQuality(value: unknown): ImageLabQuality {
  if (value === "low" || value === "high") return value
  return "medium"
}

function normalizeSize(value: unknown): ImageLabSize {
  if (value === "1024x1024" || value === "1536x1024") return value
  return "1024x1536"
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const productType = normalizeProductType(body?.productType)
    const prompt = cleanText(body?.prompt)
    const imageBuffer = parseImageDataUrl(body?.imageDataUrl)

    if (!prompt) {
      return Response.json({ error: "Missing prompt for approved image." }, { status: 400 })
    }

    const metadata = await putImageLabApprovedImage({
      productType,
      prompt,
      source: body?.source === "edit" ? "edit" : body?.source === "manual" ? "manual" : "prompt_lab",
      model: cleanText(body?.model) || "gpt-image-2",
      quality: normalizeQuality(body?.quality),
      size: normalizeSize(body?.size),
      imageBuffer,
      notes: cleanText(body?.notes),
      editInstruction: cleanText(body?.editInstruction) || undefined,
      parentImageLabId: cleanText(body?.parentImageLabId) || undefined,
    })

    return Response.json({ item: metadata })
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "Failed to approve Image Lab image." },
      { status: 500 }
    )
  }
}
