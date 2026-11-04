import crypto from "node:crypto"
import { afterEach, describe, expect, it } from "vitest"
import { authenticateClaudeApi } from "./claudeApi"

const ORIGINAL = process.env.CLAUDE_API_TOKEN_SHA256

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CLAUDE_API_TOKEN_SHA256
  else process.env.CLAUDE_API_TOKEN_SHA256 = ORIGINAL
})

function request(token?: string) {
  return new Request("https://autolisty.com/api/claude/designs", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
}

describe("Claude API authentication", () => {
  it("accepts only the configured token", () => {
    process.env.CLAUDE_API_TOKEN_SHA256 = crypto.createHash("sha256").update("claude-token").digest("hex")
    expect(authenticateClaudeApi(request("claude-token"))).toBe(true)
    expect(authenticateClaudeApi(request("other-token"))).toBe(false)
    expect(authenticateClaudeApi(request())).toBe(false)
  })

  it("rejects everything when the hash is not configured", () => {
    delete process.env.CLAUDE_API_TOKEN_SHA256
    expect(authenticateClaudeApi(request("claude-token"))).toBe(false)
  })

  it("accepts the token in the X-Autolisty-Token header", () => {
    process.env.CLAUDE_API_TOKEN_SHA256 = crypto.createHash("sha256").update("claude-token").digest("hex")
    const viaHeader = new Request("https://autolisty.com/api/mcp", { headers: { "x-autolisty-token": "claude-token" } })
    const wrong = new Request("https://autolisty.com/api/mcp", { headers: { "x-autolisty-token": "nope" } })
    expect(authenticateClaudeApi(viaHeader)).toBe(true)
    expect(authenticateClaudeApi(wrong)).toBe(false)
  })
})
