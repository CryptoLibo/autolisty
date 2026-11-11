// Prefijos que NO deben servirse por el dominio público de R2 (se bloquean en
// Cloudflare): el servidor los lee con la API de R2.
export const PRIVATE_R2_PREFIXES = ["deliverables/", "delivery-pdf/"]

/** Si la URL es del dominio público de R2 y apunta a un prefijo privado, devuelve la clave. */
export function privateKeyFromPublicUrl(url: string, publicBase = String(process.env.R2_PUBLIC_URL || "")) {
  const base = publicBase.replace(/\/+$/, "")
  if (!base || !url.startsWith(`${base}/`)) return null
  const key = decodeURIComponent(url.slice(base.length + 1).split("?")[0])
  return PRIVATE_R2_PREFIXES.some((prefix) => key.startsWith(prefix)) ? key : null
}

