import { CROP_ANCHORS } from "../automation/designIntake"
import { PRODUCT_OPTIONS } from "../products"

// Servidor MCP mínimo (Streamable HTTP, respuestas JSON sin streaming) para que
// Claude use Autolisty como conector. Sin estado: cada POST es un mensaje JSON-RPC.

export const MCP_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const
const SERVER_INFO = { name: "autolisty", title: "Autolisty", version: "1.0.0" }

type JsonRpcId = string | number | null
type JsonRpcMessage = { jsonrpc?: unknown; id?: JsonRpcId; method?: unknown; params?: unknown }

export type McpToolHandlers = {
  submitDesign: (input: unknown) => Promise<unknown>
  listDesigns: (input: { status?: string | null; limit?: number }) => Promise<unknown> | unknown
}

export class McpToolInputError extends Error {}

const PRODUCT_VALUES = PRODUCT_OPTIONS.map((product) => product.value)

const keywordSchema = {
  type: "object",
  properties: {
    keyword: { type: "string" },
    etsyMonthlySearches: { type: "number" },
    competingListings: { type: "number" },
    competition: { type: "string" },
    trend3m: { type: "number", description: "3-month trend as a fraction (0.12 = +12%)." },
  },
  required: ["keyword"],
}

export const MCP_TOOLS = [
  {
    name: "submit_design",
    title: "Submit design for approval",
    description:
      "Send a Kittl design to Autolisty. Autolisty downloads the image (https *.kittl.com only), checks its real file type against the product contract, stores it and shows it to the owner in Automation as 'waiting for approval'. Nothing reaches production until the owner approves. Include the research context so SEO and future decisions can use it.",
    inputSchema: {
      type: "object",
      properties: {
        productType: { type: "string", enum: PRODUCT_VALUES },
        prompt: { type: "string", description: "Exact prompt used to generate the design." },
        imageUrl: { type: "string", description: "Kittl result URL (https://cache.kittl.com/...)." },
        primaryKeyword: keywordSchema,
        secondaryKeywords: { type: "array", items: keywordSchema, maxItems: 20 },
        collection: { type: "string", description: "Collection or theme, e.g. 'Vintage Christmas'." },
        cropAnchor: { type: "string", enum: [...CROP_ANCHORS], description: "Where the subject sits; default center." },
        rationale: { type: "string", description: "Why this design: the market evidence in one or two sentences." },
        kittl: {
          type: "object",
          properties: { uploadId: { type: "string" }, modelId: { type: "string" }, aspectRatio: { type: "string" } },
        },
        researchSource: { type: "string", description: "e.g. 'alura'." },
      },
      required: ["productType", "prompt", "imageUrl"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: "list_designs",
    title: "List submitted designs",
    description:
      "List designs Claude has submitted, newest first, with status (PENDING_APPROVAL, QUEUED_LOCAL, ..., CANCELED), the owner's review note and the Etsy URL once published. Use it to check approvals and learn from rejection notes before creating the next batch.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Optional status filter, e.g. PENDING_APPROVAL or CANCELED." },
        limit: { type: "integer", minimum: 1, maximum: 500 },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
] as const

function result(id: JsonRpcId, value: unknown) {
  return { jsonrpc: "2.0", id, result: value }
}

function error(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } }
}

function toolResult(value: unknown, isError = false) {
  return {
    content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
    ...(isError ? { isError: true } : { structuredContent: value as Record<string, unknown> }),
  }
}

// Devuelve el objeto JSON-RPC de respuesta, o null para notificaciones (HTTP 202).
export async function handleMcpMessage(message: unknown, tools: McpToolHandlers) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return error(null, -32600, "Invalid Request")
  }
  const { jsonrpc, id = null, method, params } = message as JsonRpcMessage
  if (jsonrpc !== "2.0" || typeof method !== "string") return error(id, -32600, "Invalid Request")

  const isNotification = !("id" in (message as object))
  if (isNotification) return null

  switch (method) {
    case "initialize": {
      const requested = (params as { protocolVersion?: unknown } | undefined)?.protocolVersion
      const protocolVersion = MCP_PROTOCOL_VERSIONS.includes(requested as (typeof MCP_PROTOCOL_VERSIONS)[number])
        ? requested
        : MCP_PROTOCOL_VERSIONS[0]
      return result(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "Autolisty is LBCreaStudio's Etsy production system. Use submit_design for each design the owner should review; use list_designs to read approvals, rejections and their notes.",
      })
    }
    case "ping":
      return result(id, {})
    case "tools/list":
      return result(id, { tools: MCP_TOOLS })
    case "tools/call": {
      const call = (params || {}) as { name?: unknown; arguments?: unknown }
      const args = (call.arguments && typeof call.arguments === "object" ? call.arguments : {}) as Record<string, unknown>
      try {
        if (call.name === "submit_design") {
          return result(id, toolResult({ design: await tools.submitDesign(args) }))
        }
        if (call.name === "list_designs") {
          const limit = args.limit === undefined ? undefined : Number(args.limit)
          const status = typeof args.status === "string" ? args.status : null
          return result(id, toolResult({ designs: await tools.listDesigns({ status, limit }) }))
        }
        return error(id, -32602, `Unknown tool: ${String(call.name)}`)
      } catch (caught) {
        // Errores de validación o de negocio: se devuelven como resultado de la
        // herramienta para que Claude pueda leerlos y corregir.
        return result(id, toolResult(caught instanceof Error ? caught.message : "Tool failed.", true))
      }
    }
    default:
      return error(id, -32601, `Method not found: ${method}`)
  }
}
