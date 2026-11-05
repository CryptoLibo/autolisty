import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { r2 } from "./client"

function getBucket() {
  const bucket = process.env.R2_BUCKET
  if (!bucket) throw new Error("R2_BUCKET is not configured.")
  return bucket
}

// Cliente solo para firmar URLs de subida. Con el valor por defecto
// (WHEN_SUPPORTED) el SDK mete en la URL un checksum CRC32 calculado sobre un
// cuerpo vacío, y R2 rechaza la subida real.
let presignClient: S3Client | null = null
function getPresignClient() {
  presignClient ??= new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  })
  return presignClient
}

// Los metadatos viajan como cabeceras firmadas (el agente las envía tal cual).
// Si se dejan "subir" a la query, el agente manda cabeceras x-amz-* sin firmar → 403.
export const AUTOMATION_OUTPUT_SIGNED_HEADERS = ["x-amz-meta-sha256", "x-amz-meta-lifecycle"] as const

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
  return getSignedUrl(getPresignClient(), command, {
    expiresIn: 15 * 60,
    unhoistableHeaders: new Set(AUTOMATION_OUTPUT_SIGNED_HEADERS),
  })
}

export async function inspectAutomationOutput(key: string) {
  return r2.send(new HeadObjectCommand({ Bucket: getBucket(), Key: key }))
}
