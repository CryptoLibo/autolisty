import { generateDeliveryPdf } from "@/lib/r2/generateDeliveryPdf"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { r2 } from "@/lib/r2/client"

const BUCKET = process.env.R2_BUCKET!

export async function POST(req: Request) {

  const { deliveryId } = await req.json()

  const downloadUrl =
    `${process.env.R2_PUBLIC_URL}/deliverables/${deliveryId}/`

  const pdfBuffer = await generateDeliveryPdf({
    deliveryId,
    downloadUrl,
  })

  const key = `delivery-pdfs/${deliveryId}.pdf`

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: pdfBuffer,
    ContentType: "application/pdf",
  })

  await r2.send(command)

  return Response.json({
    url: `${process.env.R2_PUBLIC_URL}/${key}`
  })
}