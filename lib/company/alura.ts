const ALURA_BASE_URL = "https://api.alura.io/v1"

type AluraProduct = {
  id: string
  title: string | null
  shop?: { id?: string; name?: string } | null
  price?: { usd?: string | null } | null
  sales?: { est_monthly_avg?: number | null; est_lifetime?: number | null } | null
  as_of?: string | null
}

export type AluraResearch = {
  query: string
  products: AluraProduct[]
  creditsCost: number
  creditsRemaining: number | null
  observedAt: string
}

function safeCreditHeader(value: string | null) {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

export async function aluraCreditsRemaining(apiKey = process.env.ALURA_API_KEY, fetcher: typeof fetch = fetch) {
  if (!apiKey) throw new Error("ALURA_API_KEY is not configured.")
  const response = await fetcher(`${ALURA_BASE_URL}/usage`, {
    method: "GET", headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }, cache: "no-store",
  })
  if (!response.ok) throw new Error(`Alura usage check failed (${response.status}).`)
  const payload = await response.json() as { credits?: { remaining?: unknown } }
  const remaining = payload.credits?.remaining
  if (!Number.isSafeInteger(remaining) || Number(remaining) < 0) throw new Error("Alura returned an invalid remaining credit balance.")
  return Number(remaining)
}

export async function searchAluraProducts(query: string, options: { apiKey?: string; fetcher?: typeof fetch; signal?: AbortSignal } = {}): Promise<AluraResearch> {
  const apiKey = options.apiKey || process.env.ALURA_API_KEY
  if (!apiKey) throw new Error("ALURA_API_KEY is not configured.")
  const trimmed = query.trim()
  if (!trimmed || trimmed.length > 200) throw new Error("Alura query must contain 1-200 characters.")
  const url = new URL(`${ALURA_BASE_URL}/research/products`)
  url.searchParams.set("q", trimmed)
  url.searchParams.set("limit", "5")
  const response = await (options.fetcher || fetch)(url, {
    method: "GET", headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }, signal: options.signal,
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`Alura research failed (${response.status}).`)
  const payload = await response.json() as { data?: AluraProduct[] }
  if (!Array.isArray(payload.data)) throw new Error("Alura returned an invalid product list.")
  const creditsCost = safeCreditHeader(response.headers.get("Alura-Credits-Cost"))
  if (creditsCost === null) throw new Error("Alura omitted its credit cost; review usage before retrying.")
  return {
    query: trimmed, products: payload.data.slice(0, 5).map((product) => ({
      id: String(product.id), title: product.title ?? null, shop: product.shop ?? null,
      price: product.price ?? null, sales: product.sales ?? null, as_of: product.as_of ?? null,
    })),
    creditsCost, creditsRemaining: safeCreditHeader(response.headers.get("Alura-Credits-Remaining")),
    observedAt: new Date().toISOString(),
  }
}
