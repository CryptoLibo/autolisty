// Comprobación final del SEO antes de subirlo a Etsy (E4): las mismas reglas que se revisan
// a mano con review_listing, sobre el resultado completo. Sin dependencias: testeable.

export type SeoForCheck = {
  title: string
  description_keywords_5: string[]
  description_final: string
  tags_13: string[]
  etsy_attributes: Array<{ displayName: string; values: string[] }>
  media: Array<{ id: string; position: number; alt_text: string }>
}

export type SeoCheckOptions = {
  productCode: string | null
  minTitleWords?: number
  maxTitleWords?: number
  minAltCharacters?: number
}

const SUFFIX = "| (Digital Download)"

function titleWords(title: string) {
  return title.replace(SUFFIX, " ").split(/\s+/).filter((word) => word && word !== "|")
}

export function checkSeoResult(seo: SeoForCheck, options: SeoCheckOptions): string[] {
  const issues: string[] = []
  const title = seo.title.trim()

  if (!title.endsWith(SUFFIX)) issues.push(`El título no termina en «${SUFFIX}».`)
  const words = titleWords(title)
  const totalWords = words.length + 2 // «(Digital Download)» cuenta como dos palabras
  const minWords = options.minTitleWords ?? 13
  const maxWords = options.maxTitleWords ?? 15
  if (totalWords < minWords || totalWords > maxWords) issues.push(`El título tiene ${totalWords} palabras (debe tener ${minWords}–${maxWords}).`)
  if (title.length > 140) issues.push(`El título pasa de 140 caracteres (${title.length}).`)
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const word of words) {
    const key = word.toLowerCase().replace(/[^a-z0-9]/g, "")
    if (key.length < 3) continue
    if (seen.has(key)) repeated.add(key)
    seen.add(key)
  }
  if (repeated.size) issues.push(`Palabras repetidas en el título: ${[...repeated].join(", ")}.`)

  const tags = seo.tags_13.map((tag) => tag.trim()).filter(Boolean)
  if (tags.length !== 13) issues.push(`Hay ${tags.length} tags (deben ser 13).`)
  const long = tags.filter((tag) => tag.length > 20)
  if (long.length) issues.push(`Tags de más de 20 caracteres: ${long.join(", ")}.`)
  if (new Set(tags.map((tag) => tag.toLowerCase())).size !== tags.length) issues.push("Hay tags repetidos.")

  const description = seo.description_final.toLowerCase()
  const missingKeywords = seo.description_keywords_5.filter((keyword) => keyword && !description.includes(keyword.toLowerCase()))
  if (missingKeywords.length) issues.push(`Keywords que no aparecen en la descripción: ${missingKeywords.join(", ")}.`)
  const shortCode = options.productCode?.split("-").pop()
  if (shortCode && !seo.description_final.includes(shortCode)) issues.push(`La descripción no incluye el código ${shortCode}.`)

  const minAlt = options.minAltCharacters ?? 80
  const shortAlt = seo.media.filter((item) => item.alt_text.trim().length < minAlt).map((item) => item.position)
  if (shortAlt.length) issues.push(`Alt text corto o vacío en las fotos ${shortAlt.join(", ")}.`)
  const alts = seo.media.map((item) => item.alt_text.trim().toLowerCase()).filter(Boolean)
  if (new Set(alts).size !== alts.length) issues.push("Hay alt texts repetidos.")

  const attribute = (pattern: RegExp) => seo.etsy_attributes.find((item) => pattern.test(item.displayName))
  const colors = attribute(/colou?r/i)
  if (!colors || colors.values.length === 0) issues.push("Faltan los colores.")
  const room = attribute(/^room$/i)
  if (room && room.values.length < 4) issues.push(`Room tiene ${room.values.length} valores (mínimo 4).`)
  const subject = attribute(/^subject$/i)
  if (subject && subject.values.length < 2) issues.push(`Subject tiene ${subject.values.length} valores (mínimo 2).`)

  return issues
}
