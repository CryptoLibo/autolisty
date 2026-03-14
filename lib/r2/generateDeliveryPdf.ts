import { PDFArray, PDFDocument, PDFName, PDFNumber, PDFString } from "pdf-lib"
import fs from "fs"
import path from "path"

function createLinkAnnotation(
  pdfDoc: PDFDocument,
  rect: [number, number, number, number],
  url: string
) {
  return pdfDoc.context.obj({
    Type: PDFName.of("Annot"),
    Subtype: PDFName.of("Link"),
    Rect: PDFArray.withContext(pdfDoc.context),
    Border: pdfDoc.context.obj([0, 0, 0]),
    F: PDFNumber.of(4),
    H: PDFName.of("I"),
    A: pdfDoc.context.obj({
      Type: PDFName.of("Action"),
      S: PDFName.of("URI"),
      URI: PDFString.of(url),
    }),
  })
}

function setAnnotationRect(annotation: any, rect: [number, number, number, number], pdfDoc: PDFDocument) {
  const rectArray = PDFArray.withContext(pdfDoc.context)

  for (const value of rect) {
    rectArray.push(PDFNumber.of(value))
  }

  annotation.set(PDFName.of("Rect"), rectArray)
}

export async function generateDeliveryPdf(listingId: string) {
  const templatePath = path.join(process.cwd(), "templates", "delivery_template.pdf")
  const templateBytes = fs.readFileSync(templatePath)

  const pdfDoc = await PDFDocument.load(templateBytes)
  const page = pdfDoc.getPages()[0]

  const artworkUrl = `https://download.autolisty.com/artwork/${listingId}`
  const instructionsUrl = `https://download.autolisty.com/instructions/${listingId}`

  const artworkLink = createLinkAnnotation(pdfDoc, [140, 330, 460, 430], artworkUrl)
  const instructionsLink = createLinkAnnotation(pdfDoc, [140, 135, 460, 240], instructionsUrl)

  setAnnotationRect(artworkLink, [140, 330, 460, 430], pdfDoc)
  setAnnotationRect(instructionsLink, [140, 135, 460, 240], pdfDoc)

  const artworkRef = pdfDoc.context.register(artworkLink)
  const instructionsRef = pdfDoc.context.register(instructionsLink)

  const existingAnnots = page.node.Annots()

  if (existingAnnots) {
    existingAnnots.push(artworkRef)
    existingAnnots.push(instructionsRef)
  } else {
    const annots = pdfDoc.context.obj([artworkRef, instructionsRef])
    page.node.set(PDFName.of("Annots"), annots)
  }

  return await pdfDoc.save()
}
