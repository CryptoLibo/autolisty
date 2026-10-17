import crypto from "node:crypto"
import { NextResponse } from "next/server"

const AGENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/

function safeEqualHex(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false
  return crypto.timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"))
}

export function authenticateAutomationAgent(request: Request) {
  const authorization = request.headers.get("authorization") || ""
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : ""
  const agentId = (request.headers.get("x-autolisty-agent-id") || "").trim().toLowerCase()
  const expectedHash = (process.env.AUTOMATION_AGENT_TOKEN_SHA256 || "").trim().toLowerCase()

  if (!token || !AGENT_ID_PATTERN.test(agentId) || !expectedHash) return null
  const receivedHash = crypto.createHash("sha256").update(token, "utf8").digest("hex")
  return safeEqualHex(receivedHash, expectedHash) ? { agentId } : null
}

export function requireAutomationAgent(request: Request) {
  const agent = authenticateAutomationAgent(request)
  if (agent) return { agent, response: null }
  return {
    agent: null,
    response: NextResponse.json({ error: "Invalid automation agent credentials." }, { status: 401 }),
  }
}
