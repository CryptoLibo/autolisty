import { PutObjectCommand } from "@aws-sdk/client-s3"
import { r2 } from "./client"

/** Clave de la marca que indica al Worker que este código exige enlaces firmados. */
export function signedMarkerKey(productCode: string) {
  return `deliverables/${productCode}/.signed`
}

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

  // Los PDF se generan siempre con enlaces firmados: desde ahora este código los
  // exige (el Worker rechaza sus enlaces sin firma). Los listings antiguos, sin
  // marca, siguen funcionando con sus enlaces de siempre.
  const productCode = filename.replace(/\.pdf$/i, "")
  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: signedMarkerKey(productCode),
      Body: "signed",
      ContentType: "text/plain"
    })
  )

  return {
    key,
    url: `${process.env.R2_PUBLIC_URL}/${key}`
  }
}
