export const PRODUCT_CODE_PREFIX = "LBCreaStudio-"
export const PRODUCT_CODE_SUFFIX_LENGTH = 6
export const PRODUCT_CODE_PATTERN = /^LBCreaStudio-[A-Z0-9]{6}$/

const PRODUCT_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

export function generateProductCode() {
  const randomBytes = new Uint8Array(PRODUCT_CODE_SUFFIX_LENGTH)
  globalThis.crypto.getRandomValues(randomBytes)

  const suffix = Array.from(
    randomBytes,
    (value) => PRODUCT_CODE_ALPHABET[value % PRODUCT_CODE_ALPHABET.length]
  ).join("")

  return `${PRODUCT_CODE_PREFIX}${suffix}`
}

export function isProductCode(value: unknown): value is string {
  return typeof value === "string" && PRODUCT_CODE_PATTERN.test(value)
}

// Preserve the established public name used by the manual Listing and Scale flows.
export const generateListingId = generateProductCode
