import { uploadMockup } from "@/lib/r2/uploadMockup"

export async function POST(req: Request) {

  const formData = await req.formData()

  const file = formData.get("file") as File
  const listingId = String(formData.get("listingId"))
  const filename = String(formData.get("filename"))

  if (!file) {
    return new Response("Missing file", { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  const result = await uploadMockup({
    fileBuffer: buffer,
    contentType: file.type,
    listingId,
    filename,
  })

  return Response.json(result)
}