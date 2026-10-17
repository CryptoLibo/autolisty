export function expectedRequestOrigin(host: string, requestOrigin: string, authUrl: string | undefined, localDevAccess: boolean) {
  if (localDevAccess) return `http://${host}`
  if (!authUrl) return requestOrigin
  try {
    const publicUrl = new URL(authUrl)
    if (publicUrl.protocol !== "https:" || publicUrl.host !== host) return null
    return publicUrl.origin
  } catch {
    return null
  }
}
