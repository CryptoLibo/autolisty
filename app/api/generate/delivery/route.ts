import { NextResponse } from "next/server"
import { generateDeliveryPdf } from "@/lib/r2/generateDeliveryPdf"
import { uploadDeliveryPdf } from "@/lib/r2/uploadDeliveryPdf"

export async function POST(req: Request) {

  const { listingId } = await req.json()

  const pdfBytes = await generateDeliveryPdf(listingId)

  const upload = await uploadDeliveryPdf({
    fileBuffer: pdfBytes,
    filename: `${listingId}.pdf`
  })

  return NextResponse.json({
    url: upload.url
  })
}
