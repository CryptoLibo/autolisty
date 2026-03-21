export type ProductType = "frame_tv_art" | "printable_wall_art"

export type DeliveryField = {
  id: string
  label: string
  accept: string
  filenameBase: string
  fallbackExtension?: string
}

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
    value: "printable_wall_art",
    label: "Printable Wall Art",
    delivery: {
      summary:
        "Upload the 5 printable ratio files. The final PDF will link each button to the matching ratio download.",
      buttonLabel: "Generate Printable Delivery PDF",
      templateFile: "print_art_delivery.pdf",
      fields: [
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
      ],
    },
  },
]

export function getProductOption(productType: ProductType) {
  return PRODUCT_OPTIONS.find((product) => product.value === productType) || PRODUCT_OPTIONS[0]
}
