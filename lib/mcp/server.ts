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
  listDesigns: (input: { status?: string | null; limit?: number; offset?: number; since?: string | null; detail?: "summary" | "full" }) => Promise<unknown> | unknown
  reviewListing: (input: { productCode?: unknown }) => Promise<unknown>
  editListing: (input: Record<string, unknown>) => Promise<unknown>
  proposeLesson?: (input: Record<string, unknown>) => Promise<unknown> | unknown
  listLessons?: () => Promise<unknown> | unknown
  getStatus?: () => Promise<unknown> | unknown
  listFeedback?: (input: { sinceDays?: number; limit?: number }) => Promise<unknown> | unknown
  getSalesByListing?: (input: { period?: "7d" | "30d" | "90d"; limit?: number }) => Promise<unknown> | unknown
  viewListingImages?: (input: { productCode?: unknown; ranks?: unknown }) => Promise<{ productCode: string; images: Array<{ rank: number; mimeType: string; data: string }> }>
  saveReviewReport?: (input: Record<string, unknown>) => Promise<unknown> | unknown
  listReviewReports?: (input: { limit?: number }) => Promise<unknown> | unknown
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
      "Send a Kittl design to Autolisty. Autolisty downloads the image (https *.kittl.com only), checks its real file type against the product contract, stores it and shows it to the owner in Automation as 'waiting for approval'. Nothing reaches production until the owner approves. Re-sending the same image returns the existing design (duplicate: true) instead of creating a new one. Include the research context so SEO and future decisions can use it.",
    inputSchema: {
      type: "object",
      properties: {
        productType: { type: "string", enum: PRODUCT_VALUES },
        prompt: { type: "string", description: "Exact prompt used to generate the design." },
        imageUrl: { type: "string", description: "Kittl result URL (https://cache.kittl.com/...)." },
        primaryKeyword: keywordSchema,
        secondaryKeywords: { type: "array", items: keywordSchema, maxItems: 20 },
        tagCandidates: {
          type: "array",
          items: keywordSchema,
          maxItems: 40,
          description: "Keywords with real Alura metrics that could become Etsy tags (max 20 characters each to be usable as a tag). The SEO combines them with its own analysis of the image.",
        },
        competitorListings: {
          type: "array",
          maxItems: 8,
          description: "Top-selling competitor listings for the primary keyword, with their tags, Alura's estimated monthly sales and listing score.",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              tags: { type: "array", items: { type: "string" }, maxItems: 13 },
              estimatedMonthlySales: { type: "number" },
              listingScore: { type: "number" },
            },
            required: ["tags"],
          },
        },
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
      "List designs Claude has submitted, newest first, with status (PENDING_APPROVAL, QUEUED_LOCAL, ..., CANCELED), the owner's review note and the Etsy URL once published. Returns a compact summary by default (product code, status, primary keyword, note); ask detail=\"full\" for the whole brief. Use it to check approvals and learn from rejection notes before creating the next batch.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Optional status filter, e.g. PENDING_APPROVAL or CANCELED." },
        since: { type: "string", description: "Only designs created on or after this ISO date, e.g. 2026-11-01." },
        limit: { type: "integer", minimum: 1, maximum: 500, description: "Default 50." },
        offset: { type: "integer", minimum: 0, description: "Skip this many (pagination)." },
        detail: { type: "string", enum: ["summary", "full"], description: "summary (default) or full brief." },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "review_listing",
    title: "Review an Etsy listing draft",
    description:
      "Read a listing exactly as it is on Etsy (draft or published): title, tags, description, attributes, every photo in order with its alt text and the file Autolisty expected in that position, the digital file, plus the keyword research behind the design, what Autolisty generated and objective checks (lengths, 13 tags, alt text on every photo, duplicates, file attached). Use it before the owner publishes a draft. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        productCode: { type: "string", description: 'Product code, e.g. "LBCreaStudio-FT733P".' },
      },
      required: ["productCode"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "edit_listing",
    title: "Correct an Etsy listing (owner-authorized only)",
    description:
      "Change the title, description, tags, photo alt texts and/or attributes (colors, room, home style, subject, holiday…) of one listing on Etsy. Two allowed uses: (1) in a conversation, ONLY after the owner explicitly approved these specific corrections (review with review_listing first, propose, wait for the owner's yes); (2) during the owner's daily scheduled draft review, with scheduledReview=true, which the server only allows on drafts waiting for review (never published listings). Only send the fields that change. Every edit is logged with before, after and your reason, and the owner gets a phone notification. Never publish.",
    inputSchema: {
      type: "object",
      properties: {
        productCode: { type: "string", description: 'e.g. "LBCreaStudio-FT733P".' },
        title: { type: "string", maxLength: 140 },
        description: { type: "string", description: "Full new description; must keep the product code." },
        tags: { type: "array", items: { type: "string", maxLength: 20 }, maxItems: 13, description: "Full new tag list (replaces all tags)." },
        altTexts: {
          type: "array",
          maxItems: 20,
          items: {
            type: "object",
            properties: { rank: { type: "integer", minimum: 1, maximum: 20 }, altText: { type: "string", maxLength: 250 } },
            required: ["rank", "altText"],
          },
        },
        attributes: {
          type: "array",
          maxItems: 12,
          description: "Etsy attributes to set, by name with option names exactly as listed in review_listing's attributeOptions (replaces that attribute's values), e.g. { name: \"Primary color\", values: [\"Green\"] }. An empty values list removes the attribute (e.g. an Occasion that does not apply).",
          items: {
            type: "object",
            properties: { name: { type: "string" }, values: { type: "array", items: { type: "string" }, maxItems: 10 } },
            required: ["name", "values"],
          },
        },
        reason: { type: "string", description: "What was wrong and why the change is better (logged as feedback)." },
        scheduledReview: { type: "boolean", description: "true only when running the daily scheduled draft review (drafts only)." },
      },
      required: ["productCode", "reason"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "propose_lesson",
    title: "Propose an SEO lesson",
    description:
      "Propose a short rule for Autolisty's SEO generator, learned from a pattern you saw while reviewing listings (e.g. the same wrong attribute or a bad tag habit repeated). It is stored as PROPOSED and the owner gets a notification; it only reaches the SEO prompt after the owner activates it in Automation. Write it as an instruction in English, specific and testable. Do not propose one-off fixes for a single listing.",
    inputSchema: {
      type: "object",
      properties: {
        lesson: { type: "string", minLength: 10, maxLength: 400, description: "The rule, e.g. \"Never set Occasion to Housewarming just because the item is home decor.\"" },
        reason: { type: "string", description: "The evidence: which listings showed the problem." },
        productType: { type: "string", enum: PRODUCT_VALUES, description: "Only for this product; omit for all products." },
        sourceProductCode: { type: "string", description: "Listing where you saw it, e.g. LBCreaStudio-Q7ZZ9C." },
      },
      required: ["lesson", "reason"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "list_lessons",
    title: "List SEO lessons",
    description: "List the SEO lessons with their status (PROPOSED, ACTIVE, DISABLED, REJECTED), to avoid proposing duplicates and to know what the SEO already follows.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "get_status",
    title: "Production status summary",
    description:
      "One-call summary of the production system: designs per status, designs waiting for approval, incidents with their error, Etsy drafts available per product, Automaty's last contact, Etsy API calls today and active lessons. Use it at the start of a daily run or before deciding how many designs to create.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "list_feedback",
    title: "List owner feedback",
    description:
      "Compact learning feed: the owner's rejection notes on your designs, the listing corrections you made with edit_listing (fields and reason) and the results of the daily scheduled draft review. Use it before a new batch and before proposing lessons.",
    inputSchema: {
      type: "object",
      properties: {
        sinceDays: { type: "integer", minimum: 1, maximum: 365, description: "Default 30." },
        limit: { type: "integer", minimum: 1, maximum: 200, description: "Per section; default 50." },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "get_sales_by_listing",
    title: "Shop sales by listing and product",
    description:
      "Units and revenue per listing (title, product code and type when Autolisty created it) and totals per product type, from the Etsy orders already synced in the Dashboard. Costs no Alura credits: use it to base research on what the shop already sells.",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["7d", "30d", "90d"], description: "Default 30d." },
        limit: { type: "integer", minimum: 1, maximum: 200, description: "Listings to return; default 50." },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "view_listing_images",
    title: "View a listing's photos",
    description:
      "Return the photos of one listing as images (Etsy's 570px versions), in rank order, so you can check colors, subject, mockups and alt texts against what is really shown. Optionally only some ranks (e.g. [1,2] for the cover and the Artwork Preview). Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        productCode: { type: "string", description: 'e.g. "LBCreaStudio-FT733P".' },
        ranks: { type: "array", items: { type: "integer", minimum: 1, maximum: 20 }, maxItems: 12 },
      },
      required: ["productCode"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "save_review_report",
    title: "Save the daily draft review report",
    description:
      "At the end of the daily scheduled draft review, save the report: a summary, and for each reviewed draft the changes you made and the problems you found, plus the patterns that repeat (what the SEO generator should learn). Every listed draft is marked as reviewed and the owner gets a notification. Call it once per run, also when nothing needed changes.",
    inputSchema: {
      type: "object",
      properties: {
        summary: { type: "string", minLength: 10, maxLength: 4000, description: "In Spanish: what was reviewed, what was corrected, what stays for the owner." },
        listings: {
          type: "array",
          maxItems: 100,
          items: {
            type: "object",
            properties: {
              productCode: { type: "string" },
              changes: { type: "array", items: { type: "string" }, description: "Each change: field, before → after, why." },
              issues: { type: "array", items: { type: "string" }, description: "Problems found (also those you did not change and why)." },
            },
            required: ["productCode"],
          },
        },
        patterns: { type: "array", items: { type: "string" }, description: "Repeated SEO problems across listings, phrased as rules to improve the generator." },
      },
      required: ["summary", "listings"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "list_review_reports",
    title: "List daily draft review reports",
    description: "The latest daily draft review reports (newest first): summary, per-listing changes and issues, and repeated patterns. Use it to analyze with the owner what the SEO generator must improve.",
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 60, description: "Default 7." } } },
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
          "Autolisty is LBCreaStudio's Etsy production system. Use submit_design for each design the owner should review; use list_designs to read approvals, rejections and their notes; use review_listing to check an Etsy draft before it is published; use edit_listing only with the owner's approval; use propose_lesson for patterns the SEO should learn; use get_status for a quick overview.",
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
          const offset = args.offset === undefined ? undefined : Number(args.offset)
          const status = typeof args.status === "string" ? args.status : null
          const since = typeof args.since === "string" ? args.since : null
          const detail = args.detail === "full" ? "full" : "summary"
          return result(id, toolResult({ designs: await tools.listDesigns({ status, limit, offset, since, detail }) }))
        }
        if (call.name === "view_listing_images" && tools.viewListingImages) {
          const { productCode, images } = await tools.viewListingImages({ productCode: args.productCode, ranks: args.ranks })
          return result(id, {
            content: [
              { type: "text", text: `${productCode}: ${images.length} photo(s), ranks ${images.map((image) => image.rank).join(", ")}.` },
              ...images.flatMap((image) => [
                { type: "text", text: `Rank ${image.rank}:` },
                { type: "image", data: image.data, mimeType: image.mimeType },
              ]),
            ],
          })
        }
        if (call.name === "save_review_report" && tools.saveReviewReport) {
          return result(id, toolResult({ report: await tools.saveReviewReport(args) }))
        }
        if (call.name === "list_review_reports" && tools.listReviewReports) {
          const limit = args.limit === undefined ? undefined : Number(args.limit)
          return result(id, toolResult({ reports: await tools.listReviewReports({ limit }) }))
        }
        if (call.name === "list_feedback" && tools.listFeedback) {
          const sinceDays = args.sinceDays === undefined ? undefined : Number(args.sinceDays)
          const limit = args.limit === undefined ? undefined : Number(args.limit)
          return result(id, toolResult({ feedback: await tools.listFeedback({ sinceDays, limit }) }))
        }
        if (call.name === "get_sales_by_listing" && tools.getSalesByListing) {
          const period = args.period === "7d" || args.period === "90d" ? args.period : "30d"
          const limit = args.limit === undefined ? undefined : Number(args.limit)
          return result(id, toolResult({ sales: await tools.getSalesByListing({ period, limit }) }))
        }
        if (call.name === "edit_listing") {
          return result(id, toolResult({ edit: await tools.editListing(args) }))
        }
        if (call.name === "propose_lesson" && tools.proposeLesson) {
          return result(id, toolResult({ lesson: await tools.proposeLesson(args) }))
        }
        if (call.name === "list_lessons" && tools.listLessons) {
          return result(id, toolResult({ lessons: await tools.listLessons() }))
        }
        if (call.name === "get_status" && tools.getStatus) {
          return result(id, toolResult({ status: await tools.getStatus() }))
        }
        if (call.name === "review_listing") {
          return result(id, toolResult({ listing: await tools.reviewListing({ productCode: args.productCode }) }))
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
