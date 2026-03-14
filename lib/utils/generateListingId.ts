export function generateListingId() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let suffix = ""

  for (let i = 0; i < 6; i++) {
    const index = Math.floor(Math.random() * alphabet.length)
    suffix += alphabet[index]
  }

  return `LBCreaStudio-${suffix}`
}
