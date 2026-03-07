import { uploadDeliverable } from "@/lib/r2/uploadDeliverable"

export async function POST(req: Request) {

  const formData = await req.formData()

  const file = formData.get("file") as File
  const deliveryId = String(formData.get("deliveryId"))
  const filename = String(formData.get("filename"))

  if (!file) {
    return new Response("Missing file", { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  const result = await uploadDeliverable({
    fileBuffer: buffer,
    contentType: file.type,
    deliveryId,
    filename,
  })

  return Response.json(result)
}