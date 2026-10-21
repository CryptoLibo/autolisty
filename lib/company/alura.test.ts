import { describe, expect, it, vi } from "vitest"
import { searchAluraProducts } from "./alura"

describe("Alura read-only provider", () => {
  it("uses the documented endpoint without exposing the key in output", async () => {
    const fetcher = vi.fn(async (_url: URL, init: RequestInit) => {
      expect(init.method).toBe("GET")
      expect(init.headers).toMatchObject({ Authorization: "Bearer secret" })
      return new Response(JSON.stringify({ data: [{ id: "123", title: "Reading print", sales: { est_monthly_avg: 4 }, as_of: "2026-10-01" }] }), {
        headers: { "Alura-Credits-Cost": "10", "Alura-Credits-Remaining": "90" },
      })
    }) as unknown as typeof fetch
    const result = await searchAluraProducts("reading wall art", { apiKey: "secret", fetcher })
    expect(result.creditsCost).toBe(10)
    expect(result.products[0].sales?.est_monthly_avg).toBe(4)
    expect(JSON.stringify(result)).not.toContain("secret")
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it("rejects unmetered or invalid responses without another request", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [] }))) as unknown as typeof fetch
    await expect(searchAluraProducts("wall art", { apiKey: "secret", fetcher })).rejects.toThrow(/omitted its credit cost/)
    expect(fetcher).toHaveBeenCalledOnce()
  })
})
