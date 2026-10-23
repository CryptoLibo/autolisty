export type DesignConcept = {
  name: string
  visual_idea: string
  prompt: string
  rationale: string
  text_mode: "none" | "included"
  exact_text: string
  typography: string
  hierarchy: string
}

export function reviewDesignConcepts(concepts: DesignConcept[]): string[] {
  const issues: string[] = []
  if (!Array.isArray(concepts) || concepts.length < 1 || concepts.length > 3) return ["Se requieren entre uno y tres conceptos."]
  const names = new Set<string>()
  for (const [index, concept] of concepts.entries()) {
    const label = `Concepto ${index + 1}`
    if ([concept.name, concept.visual_idea, concept.prompt, concept.rationale].some((value) => typeof value !== "string" || !value.trim())) {
      issues.push(`${label}: faltan campos esenciales.`)
      continue
    }
    const name = concept.name.trim().toLocaleLowerCase("es")
    if (names.has(name)) issues.push(`${label}: nombre duplicado.`)
    names.add(name)
    if (/\b(?:leave|reserve)\s+(?:a\s+)?(?:blank\s+)?space\s+for\s+(?:the\s+)?(?:text|lettering|title|headline)\b|\b(?:add|insert)\s+(?:the\s+)?text\s+later\b/i.test(concept.prompt)) {
      issues.push(`${label}: el prompt deja el texto para después.`)
    }
    if (/\b(?:a|the)\s+(?:smaller|secondary|additional)\s+(?:subtitle|line\s+of\s+text|text\s+line)\b|\b(?:subtitle|second\s+line)\s+(?:beneath|below|under)\b/i.test(concept.prompt)) {
      issues.push(`${label}: el prompt pide texto secundario sin palabras exactas.`)
    }
    if (concept.text_mode === "included") {
      if (!concept.exact_text?.trim() || !concept.typography?.trim() || !concept.hierarchy?.trim()) {
        issues.push(`${label}: el texto necesita palabras exactas, tipografía y jerarquía.`)
      }
      if (concept.exact_text?.trim().split(/\s+/).length > 12) issues.push(`${label}: el texto propuesto es demasiado largo.`)
      if (concept.exact_text?.trim() && !concept.prompt.includes(concept.exact_text.trim())) {
        issues.push(`${label}: el prompt no incluye el texto exacto.`)
      }
      if (!/\b(?:font|typeface|typography|lettering|serif|sans|script|handwritten|display|bold|rounded|block\s+letters)\b/i.test(concept.prompt)) {
        issues.push(`${label}: el prompt no especifica tipografía.`)
      }
      if (!/\b(?:top|bottom|center|centre|middle|above|below|around|arched|stacked|headline|title|across|upper|lower|foreground|background)\b/i.test(concept.prompt)) {
        issues.push(`${label}: el prompt no especifica ubicación o jerarquía.`)
      }
    } else if (concept.text_mode !== "none" || concept.exact_text || concept.typography || concept.hierarchy) {
      issues.push(`${label}: modo de texto inconsistente.`)
    }
  }
  return issues
}

export function designConceptsText(raw: string): string {
  const parsed = JSON.parse(raw) as { concepts: DesignConcept[] }
  const issues = reviewDesignConcepts(parsed.concepts)
  if (issues.length) throw new Error(`Visual Design quality check failed: ${issues.join(" ")}`)
  return parsed.concepts.map((concept, index) => [
    `${index + 1}. ${concept.name}`,
    `Idea visual: ${concept.visual_idea}`,
    `Prompt Kittl: ${concept.prompt}`,
    ...(concept.text_mode === "included" ? [
      `Texto exacto incluido: ${concept.exact_text}`,
      `Tipografía: ${concept.typography}`,
      `Jerarquía y ubicación: ${concept.hierarchy}`,
    ] : []),
    `Motivo: ${concept.rationale}`,
  ].join("\n")).join("\n\n")
}
