import { NextResponse } from "next/server"
import fs from "fs"
import { uploadDeliverable } from "@/lib/r2/uploadDeliverable"
import { generateDeliveryPdf } from "@/lib/r2/generateDeliveryPdf"

export async function POST(req: Request) {

  const { deliveryId } = await req.json()

  const pdfPath = await generateDeliveryPdf(deliveryId)

  const pdfBuffer = fs.readFileSync(pdfPath)

  const upload = await uploadDeliverable({
    fileBuffer: pdfBuffer,
    contentType: "application/pdf",
    deliveryId,
    filename: "delivery.pdf"
  })

  return NextResponse.json({
    url: upload.url
  })
}