import { NextResponse } from "next/server"
import { generateDeliveryPdf } from "@/lib/r2/generateDeliveryPdf"
import { uploadDeliveryPdf } from "@/lib/r2/uploadDeliveryPdf"

export async function POST(req: Request) {

  const { deliveryId } = await req.json()

  const pdfBytes = await generateDeliveryPdf(deliveryId)

  const upload = await uploadDeliveryPdf({
    fileBuffer: pdfBytes,
    filename: `${deliveryId}.pdf`
  })

  return NextResponse.json({
    url: upload.url
  })
}