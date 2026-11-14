import { ETSY_API_BASE_URL, EtsyTokenPayload, getEtsyApiKeyHeader } from "./auth"

// Control de llamadas a Etsy: ritmo mínimo entre llamadas (Etsy permite ~10/s),
// tiempo máximo por llamada, reintento con espera ante 429 (y 5xx en lecturas) y
// recuento diario para el resumen de estado.
const MIN_INTERVAL_MS = 120
const TIMEOUT_MS = 30_000
const MAX_RETRIES = 2

const usage = {
  day: "",
  calls: 0,
  rateLimited: 0,
  errors: 0,
  // Lo que Etsy dice en cada respuesta (x-limit-per-day / x-remaining-today).
  dailyLimit: null as number | null,
  remainingToday: null as number | null,
}
let nextSlot = 0

function rollDay() {
  const today = new Date().toISOString().slice(0, 10)
  if (usage.day !== today) Object.assign(usage, { day: today, calls: 0, rateLimited: 0, errors: 0, dailyLimit: null, remainingToday: null })
}

function countCall(kind: "call" | "rateLimited" | "error") {
  rollDay()
  if (kind === "call") usage.calls += 1
  if (kind === "rateLimited") usage.rateLimited += 1
  if (kind === "error") usage.errors += 1
}

/** Llamadas a Etsy de hoy (desde el último arranque del servidor) y el cupo diario según Etsy. */
export function getEtsyApiUsage() {
  rollDay()
  const usedFraction = usage.dailyLimit && usage.remainingToday != null
    ? (usage.dailyLimit - usage.remainingToday) / usage.dailyLimit
    : null
  return { ...usage, usedFraction }
}

async function waitForSlot() {
  const now = Date.now()
  const slot = Math.max(now, nextSlot)
  nextSlot = slot + MIN_INTERVAL_MS
  if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now))
}

function retryDelayMs(response: Response, attempt: number) {
  const retryAfter = Number(response.headers.get("retry-after"))
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 30_000)
  return 1000 * 2 ** attempt
}

export async function etsyFetch(
  path: string,
  token: EtsyTokenPayload,
  init?: RequestInit
) {
  const method = String(init?.method || "GET").toUpperCase()
  const idempotent = method === "GET" || method === "HEAD"

  for (let attempt = 0; ; attempt += 1) {
    await waitForSlot()
    countCall("call")
    let response: Response
    try {
      response = await fetch(`${ETSY_API_BASE_URL}${path}`, {
        ...init,
        headers: {
          "x-api-key": getEtsyApiKeyHeader(),
          Authorization: `Bearer ${token.access_token}`,
          ...(init?.headers || {}),
        },
        cache: "no-store",
        signal: init?.signal ?? AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (error) {
      countCall("error")
      // Tiempo agotado o red: se reintenta solo si la llamada es de lectura.
      if (idempotent && attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt))
        continue
      }
      throw error
    }

    const limit = Number(response.headers.get("x-limit-per-day"))
    const remaining = Number(response.headers.get("x-remaining-today"))
    if (Number.isFinite(limit) && limit > 0) usage.dailyLimit = limit
    if (response.headers.has("x-remaining-today") && Number.isFinite(remaining)) usage.remainingToday = remaining

    // 429: Etsy no procesó la petición, se puede repetir con cualquier método.
    const retryable = response.status === 429 || (idempotent && response.status >= 500)
    if (response.status === 429) countCall("rateLimited")
    else if (response.status >= 500) countCall("error")
    if (!retryable || attempt >= MAX_RETRIES) return response
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs(response, attempt)))
  }
}

export async function getSelfShops(token: EtsyTokenPayload) {
  const numericUserId = Number(token.user_id)

  if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
    throw new Error("Etsy token is missing a valid numeric user id.")
  }

  const response = await etsyFetch(`/application/users/${numericUserId}/shops`, token)

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || "Failed to fetch Etsy shops")
  }

  const data = await response.json()

  if (Array.isArray(data)) {
    return data
  }

  if (Array.isArray(data?.results)) {
    return data.results
  }

  if (Array.isArray(data?.shops)) {
    return data.shops
  }

  if (data && typeof data === "object" && "shop_id" in data) {
    return [data]
  }

  return []
}

export async function getSelfShopsDebug(token: EtsyTokenPayload) {
  const numericUserId = Number(token.user_id)

  if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
    throw new Error("Etsy token is missing a valid numeric user id.")
  }

  const response = await etsyFetch(`/application/users/${numericUserId}/shops`, token)
  const rawText = await response.text()

  let parsed: unknown = null
  try {
    parsed = rawText ? JSON.parse(rawText) : null
  } catch {
    parsed = null
  }

  return {
    ok: response.ok,
    status: response.status,
    rawText,
    parsed,
  }
}

