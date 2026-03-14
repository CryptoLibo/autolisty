import { PutObjectCommand } from "@aws-sdk/client-s3"
import { r2 } from "./client"

const BUCKET = process.env.R2_BUCKET!

export async function uploadDeliverable({
  fileBuffer,
  contentType,
  listingId,
  filename,
}: {
  fileBuffer: Buffer
  contentType: string
  listingId: string
  filename: string
}) {

  const key = `deliverables/${listingId}/${filename}`

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType,
  })

  await r2.send(command)

  return {
    key,
    url: `${process.env.R2_PUBLIC_URL}/${key}`,
  }
}
