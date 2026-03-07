export function generateListingId() {

  const now = Date.now().toString(36)
  const rand = Math.random().toString(36).substring(2, 6)

  return `listing_${now}${rand}`
}