import { describe, expect, it } from "vitest"
import { fetchOfficialDailyBilling } from "./official-billing"

describe("official OpenAI billing reconciliation", () => {
  it("keeps official project/day costs separate from local per-call estimates", async () => {
    const paths: string[] = []
    const request = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      paths.push(url.pathname)
      expect(url.searchParams.get("project_ids")).toBe("proj_test")
      if (url.pathname.endsWith("/costs")) return new Response(JSON.stringify({ data: [{ results: [{ line_item: "Web search", amount: { value: 0.03 } }] }] }), { status: 200 })
      expect(url.searchParams.getAll("group_by")).toEqual(["model", "service_tier"])
      return new Response(JSON.stringify({ data: [{ results: [{ model: "gpt-5.4-mini", service_tier: "default", input_tokens: 1000, output_tokens: 200, num_model_requests: 1 }] }] }), { status: 200 })
    }) as typeof fetch
    const result = await fetchOfficialDailyBilling("2026-10-17", "proj_test", "admin_test", request)
    expect(paths).toHaveLength(2)
    expect(result.billedUsd).toBe(0.03)
    expect(result.usage).toMatchObject([{ model: "gpt-5.4-mini", inputTokens: 1000, outputTokens: 200 }])
  })

  it("detects a single project without exposing an admin key", async () => {
    const request = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      expect(url.searchParams.get("project_ids")).toBeNull()
      expect(url.searchParams.getAll("group_by")).toContain("project_id")
      const result = url.pathname.endsWith("/costs")
        ? { project_id: "proj_test", line_item: "web search tool calls", amount: { value: 0.03 } }
        : { project_id: "proj_test", model: "gpt-5.4", service_tier: "incentivized-tier", input_tokens: 100, output_tokens: 20, num_model_requests: 1 }
      return new Response(JSON.stringify({ data: [{ results: [result] }] }), { status: 200 })
    }) as typeof fetch
    const result = await fetchOfficialDailyBilling("2026-10-17", undefined, "admin_test", request)
    expect(result.projectId).toBe("proj_test")
    expect(result.billedUsd).toBe(0.03)
  })
})
