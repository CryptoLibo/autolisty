import { PutObjectCommand } from "@aws-sdk/client-s3"
import { r2 } from "./client"

export async function uploadDeliveryPdf({
  fileBuffer,
  filename
}: {
  fileBuffer: Buffer
  filename: string
}) {

  const key = `delivery-pdf/${filename}`

  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: fileBuffer,
      ContentType: "application/pdf"
    })
  )

  return {
    key,
    url: `${process.env.R2_PUBLIC_URL}/${key}`
  }
}
