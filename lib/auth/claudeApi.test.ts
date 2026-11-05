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

  it("tolerates missing, duplicated or quoted Bearer prefixes", () => {
    process.env.CLAUDE_API_TOKEN_SHA256 = crypto.createHash("sha256").update("claude-token").digest("hex")
    for (const value of ["claude-token", "Bearer claude-token", "Bearer Bearer claude-token", "bearer  claude-token", '"claude-token"']) {
      const req = new Request("https://autolisty.com/api/mcp", { headers: { authorization: value } })
      expect(authenticateClaudeApi(req)).toBe(true)
    }
  })
})
