import { publicR2Bases } from "../r2/privateKey"

// Descargas desde URLs que no controla el servidor (S9): cada salto de redirección se
// valida ANTES de pedirlo, no solo el destino final.
const MAX_REDIRECTS = 5

export async function fetchAllowed(
  input: string | URL,
  isAllowed: (url: URL) => boolean,
  init: RequestInit = {}
): Promise<Response> {
  let url = new URL(String(input))
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isAllowed(url)) throw new Error(`URL not allowed: ${url.hostname}`)
    const response = await fetch(url, { ...init, redirect: "manual" })
    if (response.status < 300 || response.status >= 400) return response
    const location = response.headers.get("location")
    if (!location) return response
    url = new URL(location, url)
  }
  throw new Error("Too many redirects.")
}

/** Archivos propios en R2 (dominio público actual o antiguo). */
export function isR2PublicUrl(url: URL) {
  if (url.protocol !== "https:" || url.username || url.password) return false
  return publicR2Bases().some((base) => {
    try {
      const allowed = new URL(base)
      return url.host === allowed.host && url.pathname.startsWith(allowed.pathname.replace(/\/$/, "") + "/")
    } catch {
      return false
    }
  })
}

/** Imágenes de Etsy (fotos de listings). */
export function isEtsyImageUrl(url: URL) {
  return url.protocol === "https:" && !url.username && !url.password && /(^|\.)etsystatic\.com$/i.test(url.hostname)
}

const CODE_PATTERN = /^[A-Za-z0-9_-]{3,64}$/
const FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,159}$/

/** Código de producto y nombre de archivo de una subida manual (Listing, Scale). */
export function validateUploadTarget(listingId: string, filename: string) {
  if (!CODE_PATTERN.test(listingId)) return "Invalid product code."
  if (!FILENAME_PATTERN.test(filename) || filename.includes("..")) return "Invalid file name."
  return null
}
