// Atributos fijos por producto (no dependen del diseño). Autolisty los pone en
// cada draft para no depender de lo que tenga el draft base del pool.

// «Number of pieces included» = obras distintas del listing (un set de 3 láminas = 3).
// Los 5 archivos de wall art son la misma obra en 5 proporciones: 1 pieza (decisión del propietario).
export const FIXED_ETSY_ATTRIBUTES: Record<string, Record<string, string[]>> = {
  vertical_wall_art: { "Aspect ratio": ["2:3", "3:4", "4:5", "11:14", "5:7 (ISO ratio)"], "Number of pieces included": ["1"] },
  nursery_wall_art: { "Aspect ratio": ["2:3", "3:4", "4:5", "11:14", "5:7 (ISO ratio)"], "Number of pieces included": ["1"] },
  // horizontal_wall_art: sin Aspect ratio (Etsy solo tiene proporciones verticales; decisión del propietario).
  horizontal_wall_art: { "Number of pieces included": ["1"] },
  frame_tv_art: { "Aspect ratio": ["16:9"], "Number of pieces included": ["1"] },
  png_designs: { "Number of pieces included": ["1"] },
}

/** Nombres de propiedades fijas que Claude también puede corregir con edit_listing. */
export const FIXED_EDITABLE_ATTRIBUTE_NAMES = new Set(["aspect ratio", "orientation", "number of pieces included", "framing"])

type TaxonomyOption = { valueId: number; name: string }

/** Opciones de Etsy con el nombre exacto de cada valor pedido (sin equivalencias). */
export function matchFixedValues(wanted: string[], options: TaxonomyOption[]) {
  const matched: TaxonomyOption[] = []
  const missing: string[] = []
  for (const value of wanted) {
    const normalized = value.trim().toLowerCase()
    const option = options.find((candidate) => candidate.name.trim().toLowerCase() === normalized)
    if (option && !matched.some((item) => item.valueId === option.valueId)) matched.push(option)
    else if (!option) missing.push(value)
  }
  return { matched, missing }
}
