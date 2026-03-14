import { PutObjectCommand } from "@aws-sdk/client-s3"
import { r2 } from "./client"

const BUCKET = process.env.R2_BUCKET!

export async function uploadPinterestImage({
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
  const key = `pinterest/${listingId}/${filename}`

  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    })
  )

  return {
    key,
    url: `${process.env.R2_PUBLIC_URL}/${key}`,
  }
}
