import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { r2 } from "./client"

function getBucket() {
  const bucket = process.env.R2_BUCKET
  if (!bucket) throw new Error("R2_BUCKET is not configured.")
  return bucket
}

export async function createAutomationOutputUpload(input: {
  key: string
  contentType: string
  sha256: string
  byteSize: number
}) {
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: input.key,
    ContentType: input.contentType,
    ContentLength: input.byteSize,
    Metadata: {
      sha256: input.sha256,
      lifecycle: "production-output",
    },
  })
  return getSignedUrl(r2, command, { expiresIn: 15 * 60 })
}

export async function inspectAutomationOutput(key: string) {
  return r2.send(new HeadObjectCommand({ Bucket: getBucket(), Key: key }))
}
