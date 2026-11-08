// Atributos de Etsy que la IA (y Claude al corregir) puede rellenar para un
// listing, con sus opciones válidas según la categoría del draft.
import type { EtsyTokenPayload } from "./auth"
import { getSellerTaxonomyProperties } from "./attributes"
import { shouldGenerateEtsyAttribute } from "../seo/attributeRules"

export type EditableAttribute = {
  propertyId: number
  name: string
  maxValues: number
  options: Array<{ valueId: number; name: string }>
}

export async function getEditableAttributes(token: EtsyTokenPayload, taxonomyId: number, productType: string) {
  const properties = await getSellerTaxonomyProperties(token, taxonomyId)
  return properties
    .map((property) => ({
      propertyId: Number(property.property_id),
      name: String(property.display_name || property.name || "").trim(),
      supports: Boolean(property.supports_attributes),
      maxValues: property.is_multivalued ? Math.max(1, Number(property.max_values_allowed || 1)) : 1,
      options: (Array.isArray(property.possible_values) ? property.possible_values : [])
        .map((value) => ({ valueId: Number(value.value_id), name: String(value.name || "").trim() }))
        .filter((value) => Number.isInteger(value.valueId) && value.valueId > 0 && value.name),
    }))
    // Igual que el SEO: solo propiedades con opciones (supports_attributes puede no venir).
    .filter((property) => property.options.length > 0 && shouldGenerateEtsyAttribute(productType, property.name))
    .map(({ supports: _supports, ...property }) => property) as EditableAttribute[]
}
