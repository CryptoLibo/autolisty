import { NextResponse } from "next/server"
import { generateDeliveryPdf } from "@/lib/r2/generateDeliveryPdf"
import { uploadDeliverable } from "@/lib/r2/uploadDeliverable"

export async function POST(req: Request) {

  const { deliveryId } = await req.json()

  const pdfBytes = await generateDeliveryPdf(deliveryId)

  const upload = await uploadDeliverable({
    fileBuffer: pdfBytes,
    contentType: "application/pdf",
    deliveryId: "delivery-pdfs",
    filename: `${deliveryId}.pdf`
  })

  return NextResponse.json({
    url: upload.url
  })
}