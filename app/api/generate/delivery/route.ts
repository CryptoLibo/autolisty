import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { generateDeliveryPdf } from "@/lib/r2/generateDeliveryPdf"
import { uploadDeliveryPdf } from "@/lib/r2/uploadDeliveryPdf"
import { normalizeProductType } from "@/lib/products"

export async function POST(req: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized

  const { listingId, productType: rawProductType } = (await req.json()) as {
    listingId: string
    productType: string
  }
  const productType = normalizeProductType(rawProductType)

  const pdfBytes = await generateDeliveryPdf(productType, listingId)

  const upload = await uploadDeliveryPdf({
    fileBuffer: Buffer.from(pdfBytes),
    filename: `${listingId}.pdf`
  })

  return NextResponse.json({
    url: upload.url
  })
}
