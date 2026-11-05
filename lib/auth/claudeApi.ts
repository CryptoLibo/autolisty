import crypto from "node:crypto"
import { NextResponse } from "next/server"

// Credencial de máquina para Claude (investigación y diseño). Igual que el agente
// local: el servidor solo guarda el SHA-256 del token en CLAUDE_API_TOKEN_SHA256,
// y la ruta /api/claude/* queda fuera de la sesión de GitHub del navegador.

function safeEqualHex(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false
  return crypto.timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"))
}

// Extrae el token de "Authorization", con o sin el prefijo "Bearer "
// (el conector MCP de claude.ai envía el token solo).
export function extractClaudeToken(request: Request) {
  const raw = (request.headers.get("authorization") || "").trim()
  return raw.replace(/^(bearer\s+)+/i, "").replace(/^["']|["']$/g, "").trim()
}

export function authenticateClaudeApi(request: Request) {
  const token = extractClaudeToken(request)
  const expectedHash = (process.env.CLAUDE_API_TOKEN_SHA256 || "").trim().toLowerCase()
  if (!token || !expectedHash) return false
  const receivedHash = crypto.createHash("sha256").update(token, "utf8").digest("hex")
  return safeEqualHex(receivedHash, expectedHash)
}

// Diagnóstico sin exponer el token: qué cabecera llegó y con qué forma.
export function describeClaudeAuthAttempt(request: Request) {
  const authorization = request.headers.get("authorization")
  const token = extractClaudeToken(request)
  return {
    hasAuthorization: authorization !== null,
    authorizationScheme: authorization ? authorization.trim().split(/\s+/)[0].slice(0, 12) : null,
    tokenLength: token.length,
    serverHashConfigured: Boolean((process.env.CLAUDE_API_TOKEN_SHA256 || "").trim()),
    userAgent: (request.headers.get("user-agent") || "").slice(0, 80),
  }
}

export function requireClaudeApi(request: Request) {
  if (authenticateClaudeApi(request)) return null
  return NextResponse.json({ error: "Invalid Claude API credentials." }, { status: 401 })
}
