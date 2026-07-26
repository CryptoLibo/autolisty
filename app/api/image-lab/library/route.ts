import { normalizeProductType } from "@/lib/products"
import {
  deleteImageLabApprovedImage,
  getImageLabMetadata,
  ImageLabStatus,
  listImageLabApprovedImages,
  updateImageLabMetadata,
} from "@/lib/r2/imageLab"

export const runtime = "nodejs"
export const maxDuration = 120

function cleanText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function normalizeStatus(value: unknown): ImageLabStatus {
  return value === "used" ? "used" : "approved"
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const rawProductType = url.searchParams.get("productType")
    const productType = rawProductType ? normalizeProductType(rawProductType) : undefined
    const status = url.searchParams.get("status")
    const items = await listImageLabApprovedImages(productType)
    const filtered = status
      ? items.filter((item) => item.status === normalizeStatus(status))
      : items

    return Response.json({ items: filtered })
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "Failed to load Image Lab library." },
      { status: 500 }
    )
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    const productType = normalizeProductType(body?.productType)
    const id = cleanText(body?.id)
    const metadata = await getImageLabMetadata(productType, id)
    const updated = await updateImageLabMetadata({
      ...metadata,
      status: normalizeStatus(body?.status),
      notes: typeof body?.notes === "string" ? cleanText(body.notes) : metadata.notes,
    })

    return Response.json({ item: updated })
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "Failed to update Image Lab item." },
      { status: 500 }
    )
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json()
    const productType = normalizeProductType(body?.productType)
    const id = cleanText(body?.id)
    const deleted = await deleteImageLabApprovedImage(productType, id)

    return Response.json(deleted)
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "Failed to delete Image Lab item." },
      { status: 500 }
    )
  }
}
