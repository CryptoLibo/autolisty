// Alt text de las fotos fijas de la tienda (posiciones 5, 8 y 11 del listing).
// Son las mismas imágenes en todos los listings de un producto, así que su texto
// se escribe una vez, revisado a mano contra cada imagen (assets de Autobuildy),
// y no se genera con IA en cada listing. Si cambias una imagen fija, cambia aquí
// su texto.
import type { ProductType } from "../products"

const SALE =
  "LBCreaStudio sale banner: buy 3 or more digital downloads and get 40% off, buy 6 or more and get 50% off, shown in bold text on a white marble background with the LB Crea Studio logo."

const WHY_CHOOSE_US =
  "Why choose LBCreaStudio: original designs, support a small shop, reliable quality, perfect for gifting and customer support, shown with simple line icons on a white marble background with the LB Crea Studio logo."

export const FIXED_IMAGE_ALT_TEXTS: Record<ProductType, Record<number, string>> = {
  frame_tv_art: {
    5: SALE,
    8: "Frame TV art details: instant download, 1 JPG file and 1 PDF setup guide, 4K 16:9 resolution 3840x2160 px. Download and save the file, upload it to your TV via app or USB, then display and enjoy.",
    11: WHY_CHOOSE_US,
  },
  vertical_wall_art: {
    5: SALE,
    8: "Vertical wall art size guide above a beige sofa: 2:3 ratio from 8x12 to 24x36 in, ISO A4 to A1, 4:5 from 8x10 to 24x30 in, 3:4 from 9x12 to 18x24 in and 11x14 in, with cm sizes.",
    11: WHY_CHOOSE_US,
  },
  horizontal_wall_art: {
    5: SALE,
    8: "Horizontal wall art size guide above a white sofa: 3:2 ratio from 12x8 to 36x24 in, 5:4 from 10x8 to 30x24 in, 4:3 from 12x9 to 24x18 in, 14x11 in and ISO A4 to A1, with cm sizes.",
    11: WHY_CHOOSE_US,
  },
  nursery_wall_art: {
    5: SALE,
    8: "Nursery wall art size guide in a kids room with a bed and rocking horse: 2:3 from 8x12 to 24x36 in, 4:5 from 8x10 to 24x30 in, 3:4 from 9x12 to 18x24 in, 11x14, 22x28 and ISO A4 to A1.",
    11: WHY_CHOOSE_US,
  },
  png_designs: {
    5: SALE,
    8: "PNG design details: digital download only, high resolution 4096x4096 px at 300 DPI, transparent background PNG file, ideal for t-shirts, mugs and tumblers, commercial use on physical products only.",
    11: WHY_CHOOSE_US,
  },
}

export function fixedImageAltText(productType: ProductType, slot: number) {
  return FIXED_IMAGE_ALT_TEXTS[productType]?.[slot] ?? null
}
