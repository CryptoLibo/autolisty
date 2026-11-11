import { describe, expect, it, vi } from "vitest"
import { handleMcpMessage, MCP_TOOLS } from "./server"

function tools() {
  return {
    submitDesign: vi.fn(async (input: unknown) => ({ productCode: "LBCreaStudio-ABC123", input })),
    listDesigns: vi.fn(() => [{ productCode: "LBCreaStudio-ABC123", status: "PENDING_APPROVAL" }]),
    reviewListing: vi.fn(async (input: { productCode?: unknown }) => ({ productCode: input.productCode, checks: [] })),
    editListing: vi.fn(async () => { throw new Error("Not authorized: the owner has not allowed Claude to edit") }),
  }
}

describe("Autolisty MCP server", () => {
  it("negotiates the protocol version", async () => {
    const response = await handleMcpMessage(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
      tools()
    )
    expect(response).toMatchObject({ id: 1, result: { protocolVersion: "2025-06-18", serverInfo: { name: "autolisty" } } })

    const fallback = await handleMcpMessage(
      { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } },
      tools()
    )
    expect((fallback as { result: { protocolVersion: string } }).result.protocolVersion).toBe("2025-11-25")
  })

  it("answers notifications with nothing", async () => {
    expect(await handleMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, tools())).toBeNull()
  })

  it("lists the tools", async () => {
    const response = (await handleMcpMessage({ jsonrpc: "2.0", id: 3, method: "tools/list" }, tools())) as {
      result: { tools: Array<{ name: string }> }
    }
    expect(response.result.tools.map((tool) => tool.name)).toEqual(["submit_design", "list_designs", "review_listing", "edit_listing", "propose_lesson", "list_lessons", "get_status"])
    expect(MCP_TOOLS[0].inputSchema.required).toEqual(["productType", "prompt", "imageUrl"])
  })

  it("calls review_listing", async () => {
    const handlers = tools()
    const response = (await handleMcpMessage(
      { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "review_listing", arguments: { productCode: "LBCreaStudio-FT733P" } } },
      handlers
    )) as { result: { structuredContent: { listing: { productCode: string } } } }
    expect(handlers.reviewListing).toHaveBeenCalledWith({ productCode: "LBCreaStudio-FT733P" })
    expect(response.result.structuredContent.listing.productCode).toBe("LBCreaStudio-FT733P")
  })

  it("returns edit refusals as readable tool errors", async () => {
    const response = (await handleMcpMessage(
      { jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "edit_listing", arguments: { productCode: "LBCreaStudio-FT733P", reason: "x" } } },
      tools()
    )) as { result: { isError: boolean; content: Array<{ text: string }> } }
    expect(response.result.isError).toBe(true)
    expect(response.result.content[0].text).toMatch(/Not authorized/)
  })

  it("calls submit_design and list_designs", async () => {
    const handlers = tools()
    const submitted = (await handleMcpMessage(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "submit_design", arguments: { productType: "png_designs" } } },
      handlers
    )) as { result: { content: Array<{ text: string }>; isError?: boolean } }
    expect(handlers.submitDesign).toHaveBeenCalledWith({ productType: "png_designs" })
    expect(submitted.result.isError).toBeUndefined()
    expect(submitted.result.content[0].text).toContain("LBCreaStudio-ABC123")

    await handleMcpMessage(
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "list_designs", arguments: { status: "CANCELED", limit: 5 } } },
      handlers
    )
    expect(handlers.listDesigns).toHaveBeenCalledWith({ status: "CANCELED", limit: 5 })
  })

  it("returns validation failures as tool errors Claude can read", async () => {
    const handlers = tools()
    handlers.submitDesign.mockRejectedValueOnce(new Error('"imageUrl" must be an https URL on kittl.com.'))
    const response = (await handleMcpMessage(
      { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "submit_design", arguments: {} } },
      handlers
    )) as { result: { content: Array<{ text: string }>; isError: boolean } }
    expect(response.result.isError).toBe(true)
    expect(response.result.content[0].text).toContain("kittl.com")
  })

  it("rejects malformed messages and unknown methods", async () => {
    expect(await handleMcpMessage([], tools())).toMatchObject({ error: { code: -32600 } })
    expect(await handleMcpMessage({ jsonrpc: "2.0", id: 7, method: "resources/list" }, tools())).toMatchObject({
      error: { code: -32601 },
    })
    expect(
      await handleMcpMessage({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "delete_everything" } }, tools())
    ).toMatchObject({ error: { code: -32602 } })
  })
})
