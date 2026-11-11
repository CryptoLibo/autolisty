// Atributos fijos por producto (no dependen del diseño). Autolisty los pone en
// cada draft para no depender de lo que tenga el draft base del pool.

export const FIXED_ETSY_ATTRIBUTES: Record<string, Record<string, string[]>> = {
  vertical_wall_art: { "Aspect ratio": ["2:3", "3:4", "4:5", "11:14", "5:7 (ISO ratio)"] },
  nursery_wall_art: { "Aspect ratio": ["2:3", "3:4", "4:5", "11:14", "5:7 (ISO ratio)"] },
  horizontal_wall_art: { "Aspect ratio": ["3:2", "4:3", "5:4", "14:11", "7:5 (ISO ratio)"] },
  frame_tv_art: { "Aspect ratio": ["16:9"] },
}

/** Nombres de propiedades fijas que Claude también puede corregir con edit_listing. */
export const FIXED_EDITABLE_ATTRIBUTE_NAMES = new Set(["aspect ratio", "orientation", "number of pieces included", "framing"])

type TaxonomyOption = { valueId: number; name: string }

function ratioKey(value: string) {
  const match = value.match(/(\d+(?:\.\d+)?)\s*[:x]\s*(\d+(?:\.\d+)?)/i)
  if (!match) return null
  const iso = /iso/i.test(value) ? "iso" : ""
  return { forward: `${match[1]}:${match[2]}${iso}`, reversed: `${match[2]}:${match[1]}${iso}` }
}

/**
 * Busca las opciones de Etsy para los valores pedidos: primero por nombre exacto;
 * si Etsy solo ofrece la proporción en la otra orientación (2:3 en vez de 3:2), usa esa.
 */
export function matchFixedValues(wanted: string[], options: TaxonomyOption[]) {
  const matched: TaxonomyOption[] = []
  const missing: string[] = []
  for (const value of wanted) {
    const normalized = value.trim().toLowerCase()
    let option = options.find((candidate) => candidate.name.trim().toLowerCase() === normalized)
    const key = ratioKey(value)
    if (!option && key) {
      option = options.find((candidate) => {
        const candidateKey = ratioKey(candidate.name)
        return candidateKey && (candidateKey.forward === key.forward || candidateKey.forward === key.reversed)
      })
    }
    if (option && !matched.some((item) => item.valueId === option!.valueId)) matched.push(option)
    else if (!option) missing.push(value)
  }
  return { matched, missing }
}
