import { PDFDocument } from "pdf-lib"
import fs from "fs"
import path from "path"

export async function generateDeliveryPdf(deliveryId: string) {

  const templatePath = path.join(process.cwd(), "templates", "delivery-template.pdf")

  const templateBytes = fs.readFileSync(templatePath)

  const pdfDoc = await PDFDocument.load(templateBytes)

  const page = pdfDoc.getPages()[0]

  const artworkUrl = `https://download.autolisty.com/artwork/${deliveryId}`
  const instructionsUrl = `https://download.autolisty.com/instructions/${deliveryId}`

  // BOTÓN 1 — DOWNLOAD DESIGN
  page.drawRectangle({
    x: 140,
    y: 300,
    width: 320,
    height: 80,
    borderWidth: 0,
    color: undefined,
    opacity: 0
  })

  page.doc.context.register(
    page.doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [140, 300, 460, 380],
      Border: [0, 0, 0],
      A: {
        Type: "Action",
        S: "URI",
        URI: artworkUrl
      }
    })
  )

  // BOTÓN 2 — DOWNLOAD GUIDE
  page.drawRectangle({
    x: 140,
    y: 180,
    width: 320,
    height: 80,
    borderWidth: 0,
    color: undefined,
    opacity: 0
  })

  page.doc.context.register(
    page.doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [140, 180, 460, 260],
      Border: [0, 0, 0],
      A: {
        Type: "Action",
        S: "URI",
        URI: instructionsUrl
      }
    })
  )

  const pdfBytes = await pdfDoc.save()

  const outputPath = path.join(
    process.cwd(),
    "tmp",
    `${deliveryId}-delivery.pdf`
  )

  fs.writeFileSync(outputPath, pdfBytes)

  return outputPath
}