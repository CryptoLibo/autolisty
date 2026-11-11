// Worker de Cloudflare para download.autolisty.com
//
// Sirve los entregables de cada listing desde R2.
// - Códigos con marca deliverables/<código>/.signed (todos los de Automation y los
//   PDF regenerados): SOLO con la firma correcta (?k=...). La firma es
//   HMAC-SHA256 del código con DOWNLOAD_LINK_SECRET (el mismo valor que en el
//   servidor de Autolisty), en base64url y recortada a 22 caracteres.
// - Códigos sin marca (listings antiguos, creados antes de Automation): como
//   siempre, sin firma.
//
// Variables del Worker (Settings → Variables and Secrets):
//   DOWNLOAD_LINK_SECRET   (Secret)  mismo valor que en el .env.local del servidor.
// Binding: R2_BUCKET → el bucket de Autolisty.

const SIGNATURE_LENGTH = 22
const CODE_PATTERN = /^[A-Za-z0-9_-]{3,64}$/

const PRINTABLE_FILES = {
  "2-3": "ratio-2-3",
  "3-4": "ratio-3-4",
  "4-5": "ratio-4-5",
  "11-14": "ratio-11-14",
  "iso": "ratio-iso",
  "3-2": "ratio-3-2",
  "4-3": "ratio-4-3",
  "5-4": "ratio-5-4",
  "14-11": "ratio-14-11",
  "7-5-iso": "ratio-7-5-iso",
}

function base64url(bytes) {
  let binary = ""
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function expectedSignature(secret, code) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(code))
  return base64url(signature).slice(0, SIGNATURE_LENGTH)
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return diff === 0
}

async function isAuthorized(env, code, signature) {
  if (signature && env.DOWNLOAD_LINK_SECRET) {
    const expected = await expectedSignature(env.DOWNLOAD_LINK_SECRET, code)
    if (constantTimeEqual(signature, expected)) return true
  }
  // Sin firma válida: solo se permite si el código NO exige firma (listing antiguo).
  const requiresSignature = await env.R2_BUCKET.head(`deliverables/${code}/.signed`)
  return !requiresSignature
}

async function findFirst(env, candidates) {
  for (const key of candidates) {
    const object = await env.R2_BUCKET.get(key)
    if (object) return { key, object }
  }
  return null
}

function fileResponse(request, key, object) {
  const filename = key.split("/").pop() || "download"
  return new Response(request.method === "HEAD" ? null : object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store, max-age=0",
    },
  })
}

function candidatesFor(base, code) {
  return ["png", "jpg", "jpeg", "webp"].map((extension) => `deliverables/${code}/${base}.${extension}`)
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 })
    }

    const url = new URL(request.url)
    const parts = url.pathname.split("/").filter(Boolean)
    const kind = parts[0]
    const code = kind === "printable" ? parts[2] : parts[1]

    if (!code || !CODE_PATTERN.test(code)) {
      return new Response("Invalid request", { status: 400 })
    }

    if (!(await isAuthorized(env, code, url.searchParams.get("k") || ""))) {
      return new Response("This download link is not valid. Please use the link from your Etsy purchase.", {
        status: 403,
      })
    }

    let found = null
    if (kind === "artwork") {
      found = await findFirst(env, candidatesFor("design", code))
    } else if (kind === "instructions") {
      found = await findFirst(env, [`deliverables/${code}/instructions.pdf`])
    } else if (kind === "printable") {
      const base = PRINTABLE_FILES[parts[1]]
      if (!base) return new Response("Invalid printable ratio", { status: 400 })
      found = await findFirst(env, candidatesFor(base, code))
    } else {
      return new Response("Invalid request", { status: 400 })
    }

    if (!found) return new Response("File not found", { status: 404 })
    return fileResponse(request, found.key, found.object)
  },
}
