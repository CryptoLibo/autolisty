export function titleCase(str: string) {
  return str
    .toLowerCase()
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

export function ensureShortTitleMaxWords(title: string, maxWords = 14) {
  const words = title.split(" ")
  return words.slice(0, maxWords).join(" ")
}

export function ensureLongTitleCharRange(
  title: string,
  min = 135,
  max = 140
) {
  if (title.length > max) {
    return title.slice(0, max)
  }

  if (title.length < min) {
    return title
  }

  return title
}

export function clampAltText(text: string, min = 150, max = 250) {
  if (text.length > max) {
    return text.slice(0, max)
  }

  if (text.length < min) {
    return text
  }

  return text
}