/** Recorta palabras antes del sufijo para respetar el límite, sin cortar nunca el sufijo. */
export function keepSuffixWithinLimit(title: string, suffix: string, maxCharacters: number) {
  const index = title.toLowerCase().lastIndexOf(suffix.toLowerCase())
  if (index < 0) return title.slice(0, maxCharacters).replace(/\s+\S*$/, "").trim()
  const tail = title.slice(index).trim()
  let head = title.slice(0, index).trim()
  while (head && `${head} ${tail}`.length > maxCharacters) {
    head = head.replace(/\s*\S+$/, "").trim()
  }
  return `${head.replace(/[,|\s]+$/, "")} ${tail}`.trim()
}
