export type ProductType = "frame_tv_art" | "printable_wall_art"

export const PRODUCT_OPTIONS: Array<{
  value: ProductType
  label: string
  delivery: {
    ready: boolean
    summary: string
    instructionsRequired: boolean
    expectedFileCount: number
  }
}> = [
  {
    value: "frame_tv_art",
    label: "Frame TV Art (Digital)",
    delivery: {
      ready: true,
      summary: "Upload the final artwork and instructions PDF to generate the customer delivery PDF.",
      instructionsRequired: true,
      expectedFileCount: 1,
    },
  },
  {
    value: "printable_wall_art",
    label: "Printable Wall Art",
    delivery: {
      ready: false,
      summary:
        "This product will use a separate delivery PDF with 5 download buttons once the Canva template is ready.",
      instructionsRequired: false,
      expectedFileCount: 5,
    },
  },
]

export function getProductOption(productType: ProductType) {
  return PRODUCT_OPTIONS.find((product) => product.value === productType) || PRODUCT_OPTIONS[0]
}
