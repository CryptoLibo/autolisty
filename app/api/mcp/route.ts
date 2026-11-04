import { NextResponse } from "next/server"
import { authenticateClaudeApi } from "@/lib/auth/claudeApi"
import { listClaudeDesigns, submitClaudeDesign } from "@/lib/automation/claudeDesigns"
import { handleMcpMessage } from "@/lib/mcp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Conector MCP de Autolisty para Claude. Autenticación: cabecera
// "Authorization: Bearer <token>" configurada en el conector (mismo token que
// /api/claude/*; el servidor solo guarda su SHA-256 en CLAUDE_API_TOKEN_SHA256).

function unauthorized() {
  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Invalid Autolisty credentials." } },
    { status: 401 }
  )
}

export async function POST(request: Request) {
  if (!authenticateClaudeApi(request)) return unauthorized()

  const message = await request.json().catch(() => undefined)
  if (message === undefined) {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 })
  }

  const response = await handleMcpMessage(message, {
    submitDesign: submitClaudeDesign,
    listDesigns: listClaudeDesigns,
  })
  if (response === null) return new Response(null, { status: 202 })
  return NextResponse.json(response)
}

// Sin flujo SSE iniciado por el servidor ni sesiones.
export async function GET(request: Request) {
  if (!authenticateClaudeApi(request)) return unauthorized()
  return new Response(null, { status: 405, headers: { Allow: "POST" } })
}

export async function DELETE(request: Request) {
  if (!authenticateClaudeApi(request)) return unauthorized()
  return new Response(null, { status: 405, headers: { Allow: "POST" } })
}
