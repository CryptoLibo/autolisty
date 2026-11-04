import crypto from "node:crypto"
import { NextResponse } from "next/server"

// Credencial de máquina para Claude (investigación y diseño). Igual que el agente
// local: el servidor solo guarda el SHA-256 del token en CLAUDE_API_TOKEN_SHA256,
// y la ruta /api/claude/* queda fuera de la sesión de GitHub del navegador.

function safeEqualHex(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false
  return crypto.timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"))
}

export function authenticateClaudeApi(request: Request) {
  // Acepta "Authorization: Bearer <token>" o "X-Autolisty-Token: <token>"
  // (cabecera personalizada del conector MCP de claude.ai).
  const authorization = request.headers.get("authorization") || ""
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : ""
  const token = bearer || (request.headers.get("x-autolisty-token") || "").trim()
  const expectedHash = (process.env.CLAUDE_API_TOKEN_SHA256 || "").trim().toLowerCase()
  if (!token || !expectedHash) return false
  const receivedHash = crypto.createHash("sha256").update(token, "utf8").digest("hex")
  return safeEqualHex(receivedHash, expectedHash)
}

export function requireClaudeApi(request: Request) {
  if (authenticateClaudeApi(request)) return null
  return NextResponse.json({ error: "Invalid Claude API credentials." }, { status: 401 })
}
