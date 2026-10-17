import type { ProductType } from "../products"

export type ProductionProductContract = {
  productType: ProductType
  label: string
  localFolderName: string
  source: {
    minFiles: number
    maxFiles: number
    acceptedMimeTypes: readonly string[]
    promptRequired: true
  }
  listing: {
    generatedImageSlots: readonly number[]
    fixedImageSlots: readonly number[]
    videoSlot: number
    videoRequired: boolean
    pinterestImageCount: number
  }
  delivery: {
    mode: "pdf" | "direct"
    requiredFieldIds: readonly string[]
  }
}

const WALL_ART_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const
const GENERATED_IMAGE_SLOTS = [1, 3, 4, 6, 7, 9, 10] as const
const FIXED_IMAGE_SLOTS = [5, 8, 11] as const

const WALL_ART_LISTING = {
  generatedImageSlots: GENERATED_IMAGE_SLOTS,
  fixedImageSlots: FIXED_IMAGE_SLOTS,
  videoSlot: 2,
  videoRequired: false,
  pinterestImageCount: 3,
} as const

export const PRODUCTION_PRODUCT_CONTRACTS: Record<
  ProductType,
  ProductionProductContract
> = {
  frame_tv_art: {
    productType: "frame_tv_art",
    label: "Frame TV Art",
    localFolderName: "Frame TV Art",
    source: {
      minFiles: 1,
      maxFiles: 1,
      acceptedMimeTypes: WALL_ART_IMAGE_MIME_TYPES,
      promptRequired: true,
    },
    listing: WALL_ART_LISTING,
    delivery: { mode: "pdf", requiredFieldIds: ["design", "instructions"] },
  },
  vertical_wall_art: {
    productType: "vertical_wall_art",
    label: "Vertical Wall Art",
    localFolderName: "Vertical Wall Art",
    source: {
      minFiles: 1,
      maxFiles: 1,
      acceptedMimeTypes: WALL_ART_IMAGE_MIME_TYPES,
      promptRequired: true,
    },
    listing: WALL_ART_LISTING,
    delivery: {
      mode: "pdf",
      requiredFieldIds: ["ratio_2_3", "ratio_3_4", "ratio_4_5", "ratio_11_14", "ratio_iso"],
    },
  },
  horizontal_wall_art: {
    productType: "horizontal_wall_art",
    label: "Horizontal Wall Art",
    localFolderName: "Horizontal Wall Art",
    source: {
      minFiles: 1,
      maxFiles: 1,
      acceptedMimeTypes: WALL_ART_IMAGE_MIME_TYPES,
      promptRequired: true,
    },
    listing: WALL_ART_LISTING,
    delivery: {
      mode: "pdf",
      requiredFieldIds: ["ratio_3_2", "ratio_4_3", "ratio_5_4", "ratio_14_11", "ratio_iso"],
    },
  },
  nursery_wall_art: {
    productType: "nursery_wall_art",
    label: "Nursery Wall Art",
    localFolderName: "Nursery Wall Art",
    source: {
      minFiles: 1,
      maxFiles: 1,
      acceptedMimeTypes: WALL_ART_IMAGE_MIME_TYPES,
      promptRequired: true,
    },
    listing: WALL_ART_LISTING,
    delivery: {
      mode: "pdf",
      requiredFieldIds: ["ratio_2_3", "ratio_3_4", "ratio_4_5", "ratio_11_14", "ratio_iso"],
    },
  },
  png_designs: {
    productType: "png_designs",
    label: "PNG Designs",
    localFolderName: "PNG Designs",
    source: {
      minFiles: 1,
      maxFiles: 1,
      acceptedMimeTypes: ["image/png"],
      promptRequired: true,
    },
    listing: {
      ...WALL_ART_LISTING,
      videoRequired: false,
    },
    delivery: { mode: "direct", requiredFieldIds: ["design"] },
  },
}

export function getProductionProductContract(productType: ProductType) {
  return PRODUCTION_PRODUCT_CONTRACTS[productType]
}
