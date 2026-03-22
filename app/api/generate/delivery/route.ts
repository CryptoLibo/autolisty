import { NextResponse } from "next/server"
import { generateDeliveryPdf } from "@/lib/r2/generateDeliveryPdf"
import { uploadDeliveryPdf } from "@/lib/r2/uploadDeliveryPdf"
import { ProductType } from "@/lib/products"

export async function POST(req: Request) {
  const { listingId, productType } = (await req.json()) as {
    listingId: string
    productType: ProductType
  }

  const pdfBytes = await generateDeliveryPdf(productType, listingId)

  const upload = await uploadDeliveryPdf({
    fileBuffer: Buffer.from(pdfBytes),
    filename: `${listingId}.pdf`
  })

  return NextResponse.json({
    url: upload.url
  })
}
