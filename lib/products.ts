export type ProductType =
  | "frame_tv_art"
  | "vertical_wall_art"
  | "horizontal_wall_art"
  | "nursery_wall_art"

export type DeliveryField = {
  id: string
  label: string
  accept: string
  filenameBase: string
  fallbackExtension?: string
}

export const VERTICAL_WALL_ART_FIELDS: DeliveryField[] = [
  {
    id: "ratio_2_3",
    label: "2:3 ratio file",
    accept: "image/png,image/jpeg,image/webp",
    filenameBase: "ratio-2-3",
    fallbackExtension: "jpg",
  },
  {
    id: "ratio_3_4",
    label: "3:4 ratio file",
    accept: "image/png,image/jpeg,image/webp",
    filenameBase: "ratio-3-4",
    fallbackExtension: "jpg",
  },
  {
    id: "ratio_4_5",
    label: "4:5 ratio file",
    accept: "image/png,image/jpeg,image/webp",
    filenameBase: "ratio-4-5",
    fallbackExtension: "jpg",
  },
  {
    id: "ratio_11_14",
    label: "11:14 ratio file",
    accept: "image/png,image/jpeg,image/webp",
    filenameBase: "ratio-11-14",
    fallbackExtension: "jpg",
  },
  {
    id: "ratio_iso",
    label: "ISO size file",
    accept: "image/png,image/jpeg,image/webp",
    filenameBase: "ratio-iso",
    fallbackExtension: "jpg",
  },
]

export const HORIZONTAL_WALL_ART_FIELDS: DeliveryField[] = [
  {
    id: "ratio_3_2",
    label: "3:2 ratio file",
    accept: "image/png,image/jpeg,image/webp",
    filenameBase: "ratio-3-2",
    fallbackExtension: "jpg",
  },
  {
    id: "ratio_4_3",
    label: "4:3 ratio file",
    accept: "image/png,image/jpeg,image/webp",
    filenameBase: "ratio-4-3",
    fallbackExtension: "jpg",
  },
  {
    id: "ratio_5_4",
    label: "5:4 ratio file",
    accept: "image/png,image/jpeg,image/webp",
    filenameBase: "ratio-5-4",
    fallbackExtension: "jpg",
  },
  {
    id: "ratio_14_11",
    label: "14:11 ratio file",
    accept: "image/png,image/jpeg,image/webp",
    filenameBase: "ratio-14-11",
    fallbackExtension: "jpg",
  },
  {
    id: "ratio_iso",
    label: "7:5 ISO ratio file",
    accept: "image/png,image/jpeg,image/webp",
    filenameBase: "ratio-7-5-iso",
    fallbackExtension: "jpg",
  },
]

export const PRODUCT_OPTIONS: Array<{
  value: ProductType
  label: string
  delivery: {
    summary: string
    buttonLabel: string
    templateFile: string
    fields: DeliveryField[]
  }
}> = [
  {
    value: "frame_tv_art",
    label: "Frame TV Art (Digital)",
    delivery: {
      summary: "Upload the final artwork and instructions PDF to generate the customer delivery PDF.",
      buttonLabel: "Generate Delivery PDF",
      templateFile: "frame_tv_delivery.pdf",
      fields: [
        {
          id: "design",
          label: "Final design file",
          accept: "image/png,image/jpeg,image/webp",
          filenameBase: "design",
          fallbackExtension: "jpg",
        },
        {
          id: "instructions",
          label: "Instructions PDF",
          accept: "application/pdf",
          filenameBase: "instructions.pdf",
        },
      ],
    },
  },
  {
    value: "vertical_wall_art",
    label: "Vertical Wall Art",
    delivery: {
      summary:
        "Upload the 5 vertical ratio files. The final PDF will link each button to the matching ratio download.",
      buttonLabel: "Generate Vertical Delivery PDF",
      templateFile: "print_art_delivery.pdf",
      fields: VERTICAL_WALL_ART_FIELDS,
    },
  },
  {
    value: "horizontal_wall_art",
    label: "Horizontal Wall Art",
    delivery: {
      summary:
        "Upload the 5 horizontal ratio files. The final PDF will link each button to the matching ratio download.",
      buttonLabel: "Generate Horizontal Delivery PDF",
      templateFile: "horizontal_art_delivery.pdf",
      fields: HORIZONTAL_WALL_ART_FIELDS,
    },
  },
  {
    value: "nursery_wall_art",
    label: "Nursery Wall Art",
    delivery: {
      summary:
        "Upload the 5 nursery ratio files. Nursery uses the same vertical delivery structure with nursery-focused artwork and mockups.",
      buttonLabel: "Generate Nursery Delivery PDF",
      templateFile: "print_art_delivery.pdf",
      fields: VERTICAL_WALL_ART_FIELDS,
    },
  },
]

export function normalizeProductType(value: unknown): ProductType {
  if (value === "printable_wall_art") return "vertical_wall_art"
  if (
    value === "frame_tv_art" ||
    value === "vertical_wall_art" ||
    value === "horizontal_wall_art" ||
    value === "nursery_wall_art"
  ) {
    return value
  }

  return "frame_tv_art"
}

export function isRatioWallArtProduct(productType: ProductType) {
  return productType !== "frame_tv_art"
}

export function isHorizontalWallArtProduct(productType: ProductType) {
  return productType === "horizontal_wall_art"
}

export function getProductOption(productType: ProductType) {
  return PRODUCT_OPTIONS.find((product) => product.value === productType) || PRODUCT_OPTIONS[0]
}
