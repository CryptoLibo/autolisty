import fs from "fs"
import path from "path"

export async function generateDeliveryPdf({
  deliveryId,
  downloadUrl,
}: {
  deliveryId: string
  downloadUrl: string
}) {

  const templatePath = path.join(
    process.cwd(),
    "templates",
    "delivery_template.pdf"
  )

  let pdfBuffer = fs.readFileSync(templatePath)

  const placeholder = "https://DOWNLOAD_LINK"

  const updated = pdfBuffer
    .toString("binary")
    .replace(placeholder, downloadUrl)

  return Buffer.from(updated, "binary")
}