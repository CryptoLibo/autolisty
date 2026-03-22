import { PDFArray, PDFDocument, PDFName, PDFNumber, PDFString } from "pdf-lib"
import fs from "fs"
import path from "path"
import { ProductType } from "@/lib/products"

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

const DELIVERY_LAYOUTS: Record<
  ProductType,
  {
    templateFile: string
    links: Array<{
      rect: [number, number, number, number]
      url: (listingId: string) => string
    }>
  }
> = {
  frame_tv_art: {
    templateFile: "frame_tv_delivery.pdf",
    links: [
      {
        rect: [140, 330, 460, 430],
        url: (listingId) => `https://download.autolisty.com/artwork/${listingId}`,
      },
      {
        rect: [140, 135, 460, 240],
        url: (listingId) => `https://download.autolisty.com/instructions/${listingId}`,
      },
    ],
  },
  printable_wall_art: {
    templateFile: "print_art_delivery.pdf",
    links: [
      {
        rect: [42, 378, 196, 420],
        url: (listingId) => `https://download.autolisty.com/printable/2-3/${listingId}`,
      },
      {
        rect: [362, 378, 516, 420],
        url: (listingId) => `https://download.autolisty.com/printable/3-4/${listingId}`,
      },
      {
        rect: [160, 285, 389, 329],
        url: (listingId) => `https://download.autolisty.com/printable/4-5/${listingId}`,
      },
      {
        rect: [41, 151, 198, 194],
        url: (listingId) => `https://download.autolisty.com/printable/11-14/${listingId}`,
      },
      {
        rect: [359, 151, 516, 194],
        url: (listingId) => `https://download.autolisty.com/printable/iso/${listingId}`,
      },
    ],
  },
}

export async function generateDeliveryPdf(productType: ProductType, listingId: string) {
  const delivery = DELIVERY_LAYOUTS[productType]
  if (!delivery) {
    throw new Error(`Unsupported product type for delivery PDF: ${productType}`)
  }

  const templatePath = path.join(process.cwd(), "templates", delivery.templateFile)
  const templateBytes = fs.readFileSync(templatePath)

  const pdfDoc = await PDFDocument.load(templateBytes)
  const page = pdfDoc.getPages()[0]

  const existingAnnots = page.node.Annots()
  const annotationRefs = delivery.links.map((link) => {
    const annotation = createLinkAnnotation(pdfDoc, link.rect, link.url(listingId))
    setAnnotationRect(annotation, link.rect, pdfDoc)
    return pdfDoc.context.register(annotation)
  })

  if (existingAnnots) {
    for (const annotationRef of annotationRefs) {
      existingAnnots.push(annotationRef)
    }
  } else {
    const annots = pdfDoc.context.obj(annotationRefs)
    page.node.set(PDFName.of("Annots"), annots)
  }

  return await pdfDoc.save()
}
