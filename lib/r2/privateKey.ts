// Prefijos que NO deben servirse por el dominio público de R2 (se bloquean en
// Cloudflare): el servidor los lee con la API de R2.
export const PRIVATE_R2_PREFIXES = ["deliverables/", "delivery-pdf/", "backups/"]

/**
 * Bases públicas de R2 conocidas: la actual (R2_PUBLIC_URL) y la anterior
 * (R2_LEGACY_PUBLIC_URL, p. ej. el dominio r2.dev tras pasar a un dominio propio),
 * para que las URLs guardadas antes del cambio sigan resolviéndose.
 */
export function publicR2Bases(
  current = String(process.env.R2_PUBLIC_URL || ""),
  legacy = String(process.env.R2_LEGACY_PUBLIC_URL || "")
) {
  return [current, legacy].map((base) => base.replace(/\/+$/, "")).filter(Boolean)
}

/** Clave de R2 de una URL pública (actual o antigua), o null si no es de R2. */
export function r2KeyFromPublicUrl(url: string, bases = publicR2Bases()) {
  const base = bases.find((candidate) => url.startsWith(`${candidate}/`))
  if (!base) return null
  return decodeURIComponent(url.slice(base.length + 1).split("?")[0])
}

/** Si la URL es de R2 y apunta a un prefijo privado, devuelve la clave. */
export function privateKeyFromPublicUrl(url: string, publicBase?: string, legacyBase?: string) {
  const key = r2KeyFromPublicUrl(url, publicR2Bases(publicBase, legacyBase))
  return key && PRIVATE_R2_PREFIXES.some((prefix) => key.startsWith(prefix)) ? key : null
}

/** Traduce una URL del dominio antiguo de R2 al actual (para servicios externos como Pinterest). */
export function currentPublicUrl(url: string) {
  const [current, legacy] = [process.env.R2_PUBLIC_URL, process.env.R2_LEGACY_PUBLIC_URL].map((base) =>
    String(base || "").replace(/\/+$/, ""))
  if (current && legacy && url.startsWith(`${legacy}/`)) return `${current}/${url.slice(legacy.length + 1)}`
  return url
}
