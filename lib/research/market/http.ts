export async function fetchMarketPage(url: URL, headers: Record<string, string>, fetcher: typeof fetch = fetch) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)
    let response: Response
    try { response = await fetcher(url, { headers, signal: controller.signal, cache: "no-store" }) }
    finally { clearTimeout(timeout) }
    if (response.status !== 429 || attempt === 1) return response
    const seconds = Number(response.headers.get("Retry-After"))
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 2) return response
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
  }
  throw new Error("Market request exhausted its retry limit.")
}
