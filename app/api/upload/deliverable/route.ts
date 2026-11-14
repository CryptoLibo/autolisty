import { uploadDeliverable } from "@/lib/r2/uploadDeliverable"
import { requireOwnerApi } from "@/lib/auth/owner"
import { validateUploadTarget } from "@/lib/http/safeFetch"

export async function POST(req: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized

  const formData = await req.formData()

  const file = formData.get("file") as File
  const listingId = String(formData.get("listingId"))
  const filename = String(formData.get("filename"))

  if (!file || typeof file === "string") {
    return new Response("Missing file", { status: 400 })
  }
  const invalid = validateUploadTarget(listingId, filename)
  if (invalid) return new Response(invalid, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())

  const result = await uploadDeliverable({
    fileBuffer: buffer,
    contentType: file.type,
    listingId,
    filename,
  })

  return Response.json(result)
}
