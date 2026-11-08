// Qué atributos de Etsy rellena la IA (y puede corregir Claude) por producto.
export const ETSY_DYNAMIC_ATTRIBUTE_NAMES = new Set([
  "primary color",
  "secondary color",
  "home style",
  "room",
  "subject",
  "art subject",
  "occasion",
  "holiday",
])

export function shouldGenerateEtsyAttribute(productType: string, displayName: string) {
  const normalized = String(displayName || "").replace(/\s+/g, " ").trim().toLowerCase()
  if (!ETSY_DYNAMIC_ATTRIBUTE_NAMES.has(normalized)) return false
  // Holiday/Occasion: todos los productos (solo cuando el tema es evidente).
  if (
    productType === "png_designs" &&
    !["subject", "art subject", "occasion", "holiday"].includes(normalized)
  ) {
    return false
  }
  return true
}
