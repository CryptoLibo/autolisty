import { GetObjectCommand } from "@aws-sdk/client-s3"
import { r2 } from "./client"
export { PRIVATE_R2_PREFIXES, privateKeyFromPublicUrl } from "./privateKey"

export async function readR2Object(key: string) {
  const result = await r2.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key }))
  if (!result.Body) throw new Error(`R2 object ${key} is empty.`)
  const bytes = await result.Body.transformToByteArray()
  return { fileBuffer: Buffer.from(bytes), contentType: result.ContentType || "application/octet-stream" }
}
