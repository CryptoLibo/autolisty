import crypto from "node:crypto"

// Firma de los enlaces de descarga (download.autolisty.com). El Worker de
// Cloudflare calcula la misma firma con el mismo secreto y solo sirve el archivo
// si coincide: conocer el código del listing ya no basta para descargarlo.

export const DOWNLOAD_SIGNATURE_LENGTH = 22

function downloadSecret() {
  const secret = String(process.env.DOWNLOAD_LINK_SECRET || "")
  if (secret.length < 32) {
    throw new Error("DOWNLOAD_LINK_SECRET is missing or shorter than 32 characters; delivery links cannot be signed.")
  }
  return secret
}

/** HMAC-SHA256 del código del listing, en base64url, recortado a 22 caracteres (132 bits). */
export function downloadSignature(productCode: string, secret = downloadSecret()) {
  return crypto
    .createHmac("sha256", secret)
    .update(productCode.trim())
    .digest("base64url")
    .slice(0, DOWNLOAD_SIGNATURE_LENGTH)
}

export function signedDownloadUrl(url: string, productCode: string, secret?: string) {
  const parsed = new URL(url)
  parsed.searchParams.set("k", downloadSignature(productCode, secret))
  return parsed.toString()
}
