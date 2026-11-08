import { NextResponse } from "next/server"
import { authenticateClaudeApi, describeClaudeAuthAttempt } from "@/lib/auth/claudeApi"
import { listClaudeDesigns, submitClaudeDesign } from "@/lib/automation/claudeDesigns"
import { handleMcpMessage } from "@/lib/mcp/server"
import { reviewListingDraft } from "@/lib/automation/draftReview"
import { editListingDraft } from "@/lib/automation/draftEdit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Conector MCP de Autolisty para Claude. Autenticación: cabecera
// "Authorization: Bearer <token>" configurada en el conector (mismo token que
// /api/claude/*; el servidor solo guarda su SHA-256 en CLAUDE_API_TOKEN_SHA256).

function unauthorized(request: Request) {
  console.warn("[mcp] rejected request", request.method, JSON.stringify(describeClaudeAuthAttempt(request)))
  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Invalid Autolisty credentials." } },
    { status: 401 }
  )
}

export async function POST(request: Request) {
  if (!authenticateClaudeApi(request)) return unauthorized(request)

  const message = await request.json().catch(() => undefined)
  const method = message && typeof message === "object" && "method" in message ? String(message.method) : "?"
  console.info("[mcp] request", method)
  if (message === undefined) {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 })
  }

  const response = await handleMcpMessage(message, {
    submitDesign: submitClaudeDesign,
    listDesigns: listClaudeDesigns,
    reviewListing: reviewListingDraft,
    editListing: editListingDraft,
  })
  if (method === "tools/list" && response && "result" in response) {
    const tools = (response.result as { tools?: Array<{ name: string }> }).tools || []
    console.info(`[mcp] tools/list → ${tools.length}: ${tools.map((tool) => tool.name).join(", ")}`)
  }
  if (response === null) return new Response(null, { status: 202 })
  return NextResponse.json(response)
}

// Sin flujo SSE iniciado por el servidor ni sesiones.
export async function GET(request: Request) {
  if (!authenticateClaudeApi(request)) return unauthorized(request)
  return new Response(null, { status: 405, headers: { Allow: "POST" } })
}

export async function DELETE(request: Request) {
  if (!authenticateClaudeApi(request)) return unauthorized(request)
  return new Response(null, { status: 405, headers: { Allow: "POST" } })
}
