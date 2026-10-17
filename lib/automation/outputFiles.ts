import path from "node:path"
import { getProductionProductContract } from "./productContracts"
import type { AutomationJobFile } from "./types"
import type { ProductType } from "../products"

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"])
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v"])

const DELIVERY_SLOT_BY_FILENAME: Record<ProductType, Record<string, string>> = {
  vertical_wall_art: {
    "2x3.jpg": "ratio_2_3",
    "3x4.jpg": "ratio_3_4",
    "4x5.jpg": "ratio_4_5",
    "11x14.jpg": "ratio_11_14",
    "5x7iso.jpg": "ratio_iso",
  },
  horizontal_wall_art: {
    "3x2.jpg": "ratio_3_2",
    "4x3.jpg": "ratio_4_3",
    "5x4.jpg": "ratio_5_4",
    "14x11.jpg": "ratio_14_11",
    "7x5iso.jpg": "ratio_iso",
  },
  nursery_wall_art: {
    "2x3.jpg": "ratio_2_3",
    "3x4.jpg": "ratio_3_4",
    "4x5.jpg": "ratio_4_5",
    "11x14.jpg": "ratio_11_14",
    "5x7iso.jpg": "ratio_iso",
  },
  frame_tv_art: {
    "frametvart.jpg": "design",
    "quick setup guide.pdf": "instructions",
  },
  png_designs: {
    "design.png": "design",
  },
}

export type ClassifiedAutomationOutput = {
  relativePath: string
  slotKey: string
  role: "LISTING_MEDIA" | "PINTEREST_IMAGE" | "DELIVERABLE"
  position: number | null
  r2Key: string
}

export function normalizeAutomationOutputPath(value: string) {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "")
  if (
    !normalized ||
    normalized.length > 240 ||
    normalized.startsWith("/") ||
    /^[a-z]:/i.test(normalized) ||
    normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Invalid listing output path.")
  }
  return normalized
}

export function classifyAutomationOutput(input: {
  productType: ProductType
  productCode: string
  relativePath: string
}): ClassifiedAutomationOutput {
  const relativePath = normalizeAutomationOutputPath(input.relativePath)
  const parts = relativePath.split("/")
  const filename = parts.at(-1)!
  const extension = path.extname(filename).toLowerCase()

  if (parts.length === 1) {
    const match = filename.match(/^(\d{1,2})\.[^.]+$/)
    const position = match ? Number(match[1]) : 0
    const validMedia = position === 2
      ? VIDEO_EXTENSIONS.has(extension)
      : IMAGE_EXTENSIONS.has(extension)
    if (!match || position < 1 || position > 11 || !validMedia) {
      throw new Error(`Unsupported listing media file: ${relativePath}`)
    }
    return {
      relativePath,
      slotKey: `listing:${position}`,
      role: "LISTING_MEDIA",
      position,
      r2Key: `mockups/${input.productCode}/${filename}`,
    }
  }

  if (parts.length === 2 && parts[0].toLocaleLowerCase("es") === "pines") {
    const match = filename.match(/^pin-(\d+)\.[^.]+$/i)
    const position = match ? Number(match[1]) : 0
    if (!match || position < 1 || position > 3 || !IMAGE_EXTENSIONS.has(extension)) {
      throw new Error(`Unsupported Pinterest file: ${relativePath}`)
    }
    return {
      relativePath,
      slotKey: `pinterest:${position}`,
      role: "PINTEREST_IMAGE",
      position,
      r2Key: `pinterest/${input.productCode}/${filename}`,
    }
  }

  if (parts.length === 2 && parts[0].toLocaleLowerCase("es") === "diseños finales") {
    const fieldId = DELIVERY_SLOT_BY_FILENAME[input.productType][filename.toLowerCase()]
    if (!fieldId) throw new Error(`Unsupported deliverable file: ${relativePath}`)
    return {
      relativePath,
      slotKey: `deliverable:${fieldId}`,
      role: "DELIVERABLE",
      position: null,
      r2Key: `deliverables/${input.productCode}/${filename}`,
    }
  }

  throw new Error(`File is not part of the production contract: ${relativePath}`)
}

export function validateAutomationOutputFiles(
  productType: ProductType,
  files: AutomationJobFile[]
) {
  const verified = new Set(
    files.filter((file) => file.status === "VERIFIED").map((file) => file.slotKey)
  )
  const contract = getProductionProductContract(productType)
  const required = [
    ...contract.listing.generatedImageSlots.map((slot) => `listing:${slot}`),
    ...contract.listing.fixedImageSlots.map((slot) => `listing:${slot}`),
    ...Array.from({ length: contract.listing.pinterestImageCount }, (_, index) => `pinterest:${index + 1}`),
    ...contract.delivery.requiredFieldIds.map((fieldId) => `deliverable:${fieldId}`),
  ]
  if (contract.listing.videoRequired) required.push(`listing:${contract.listing.videoSlot}`)
  const missing = required.filter((slotKey) => !verified.has(slotKey))
  if (missing.length > 0) {
    throw new Error(`Listing output is incomplete. Missing: ${missing.join(", ")}.`)
  }
  return { required, verified: [...verified], optionalVideoPresent: verified.has("listing:2") }
}
