// Utilidades de navegador para WebAuthn: convierten entre base64url (lo que envía el
// servidor) y ArrayBuffer (lo que espera navigator.credentials).

export function base64UrlToBuffer(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0)).buffer
}

export function bufferToBase64Url(buffer: ArrayBuffer) {
  let binary = ""
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || "Request failed.")
  return data
}

export function passkeysSupported() {
  return typeof window !== "undefined" && "PublicKeyCredential" in window && Boolean(navigator.credentials)
}

export async function registerPasskey(options: { setupCode?: string; name?: string } = {}) {
  const { challengeId, publicKey } = await postJson("/api/auth/passkey/register/options", { setupCode: options.setupCode })
  const credential = (await navigator.credentials.create({
    publicKey: {
      ...publicKey,
      challenge: base64UrlToBuffer(publicKey.challenge),
      user: { ...publicKey.user, id: base64UrlToBuffer(publicKey.user.id) },
      excludeCredentials: publicKey.excludeCredentials.map((item: { id: string; type: "public-key" }) => ({
        ...item,
        id: base64UrlToBuffer(item.id),
      })),
    },
  })) as PublicKeyCredential | null
  if (!credential) throw new Error("Passkey creation was canceled.")
  const response = credential.response as AuthenticatorAttestationResponse
  await postJson("/api/auth/passkey/register/verify", {
    challengeId,
    name: options.name,
    credential: {
      id: credential.id,
      response: {
        clientDataJSON: bufferToBase64Url(response.clientDataJSON),
        attestationObject: bufferToBase64Url(response.attestationObject),
      },
    },
  })
}

export async function signInWithPasskey() {
  const { challengeId, publicKey } = await postJson("/api/auth/passkey/login/options", {})
  const credential = (await navigator.credentials.get({
    publicKey: { ...publicKey, challenge: base64UrlToBuffer(publicKey.challenge), allowCredentials: [] },
  })) as PublicKeyCredential | null
  if (!credential) throw new Error("Sign-in was canceled.")
  const response = credential.response as AuthenticatorAssertionResponse
  await postJson("/api/auth/passkey/login/verify", {
    challengeId,
    credential: {
      id: credential.id,
      response: {
        clientDataJSON: bufferToBase64Url(response.clientDataJSON),
        authenticatorData: bufferToBase64Url(response.authenticatorData),
        signature: bufferToBase64Url(response.signature),
      },
    },
  })
}

export function guessDeviceName() {
  const agent = typeof navigator === "undefined" ? "" : navigator.userAgent
  if (/iPhone/i.test(agent)) return "iPhone"
  if (/iPad/i.test(agent)) return "iPad"
  if (/Android/i.test(agent)) return "Android"
  if (/Macintosh/i.test(agent)) return "Mac"
  if (/Windows/i.test(agent)) return "Windows PC"
  return "Device"
}
