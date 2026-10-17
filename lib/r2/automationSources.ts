import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3"
import { r2 } from "./client"

function getBucket() {
  const bucket = process.env.R2_BUCKET
  if (!bucket) throw new Error("R2_BUCKET is not configured.")
  return bucket
}

export async function uploadAutomationSource(input: {
  key: string
  body: Buffer
  contentType: string
  sha256: string
}) {
  await r2.send(new PutObjectCommand({
    Bucket: getBucket(),
    Key: input.key,
    Body: input.body,
    ContentType: input.contentType,
    Metadata: {
      sha256: input.sha256,
      lifecycle: "temporary-production-source",
    },
  }))
}

export async function getAutomationSource(key: string) {
  return r2.send(new GetObjectCommand({ Bucket: getBucket(), Key: key }))
}

export async function deleteAutomationSource(key: string) {
  await r2.send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }))
}
