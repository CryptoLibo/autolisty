import { PDFDocument } from "pdf-lib"
import fs from "fs"
import path from "path"

export async function generateDeliveryPdf(deliveryId: string) {

  const templatePath = path.join(process.cwd(), "templates", "delivery_template.pdf")

  const templateBytes = fs.readFileSync(templatePath)

  const pdfDoc = await PDFDocument.load(templateBytes)

  const page = pdfDoc.getPages()[0]

  const artworkUrl = `https://download.autolisty.com/artwork/${deliveryId}`
  const instructionsUrl = `https://download.autolisty.com/instructions/${deliveryId}`

  const artworkLink = pdfDoc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [140, 360, 460, 470],
    Border: [0, 0, 0],
    A: {
      Type: "Action",
      S: "URI",
      URI: artworkUrl
    }
  })

  const instructionsLink = pdfDoc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [140, 130, 460, 250],
    Border: [0, 0, 0],
    A: {
      Type: "Action",
      S: "URI",
      URI: instructionsUrl
    }
  })

  const artworkRef = pdfDoc.context.register(artworkLink)
  const instructionsRef = pdfDoc.context.register(instructionsLink)

  const annots = page.node.Annots()

  if (annots) {
    annots.push(artworkRef)
    annots.push(instructionsRef)
  } else {
    page.node.set(
      pdfDoc.context.obj({
        Annots: [artworkRef, instructionsRef]
      })
    )
  }

  const pdfBytes = await pdfDoc.save()

  const tmpDir = path.join(process.cwd(), "tmp")

  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true })
  }

  const outputPath = path.join(
    tmpDir,
    `${deliveryId}-delivery.pdf`
  )

  fs.writeFileSync(outputPath, pdfBytes)

  return outputPath
}