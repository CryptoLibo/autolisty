export type PromptCandidate = { title: string; prompt: string; subject: string; composition: string; commercialAngle: string }

const words = (value: string) => new Set(value.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
function similarity(a: string, b: string) {
  const left = words(a), right = words(b)
  const union = new Set([...left, ...right]).size
  return union ? [...left].filter((word) => right.has(word)).length / union : 1
}

export function evaluatePrompts(prompts: PromptCandidate[], mode: "variations" | "independent", requiredTerms: string[] = []) {
  const issues: Array<{ index: number; reason: string }> = []
  if (prompts.length !== 4) return { passed: false, issues: [{ index: -1, reason: "Exactly four prompts are required." }] }
  for (let index = 0; index < prompts.length; index++) {
    const current = prompts[index]
    if (![current.title, current.prompt, current.subject, current.composition, current.commercialAngle].every((part) => part?.trim())) {
      issues.push({ index, reason: "Missing creative or commercial direction." })
    }
    for (const term of requiredTerms) {
      if (!current.prompt.toLowerCase().includes(term.toLowerCase())) issues.push({ index, reason: `Missing requested term: ${term}` })
    }
    for (let previous = 0; previous < index; previous++) {
      const other = prompts[previous]
      const sameSubject = similarity(current.subject, other.subject) > 0.8
      const sameComposition = similarity(current.composition, other.composition) > 0.8
      const sameAngle = similarity(current.commercialAngle, other.commercialAngle) > 0.8
      if (similarity(current.prompt, other.prompt) > 0.78 ||
        (sameComposition && sameAngle && (mode === "variations" || sameSubject))) {
        issues.push({ index, reason: `Too similar to prompt ${previous + 1}.` })
      }
      if (mode === "independent" && sameSubject && sameComposition) {
        issues.push({ index, reason: `Independent concept repeats subject and composition of prompt ${previous + 1}.` })
      }
    }
  }
  return { passed: issues.length === 0, issues }
}
