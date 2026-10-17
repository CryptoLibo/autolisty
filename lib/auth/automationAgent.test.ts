import crypto from "node:crypto"
import { afterEach, describe, expect, it } from "vitest"
import { authenticateAutomationAgent } from "./automationAgent"

const ORIGINAL_TOKEN_HASH = process.env.AUTOMATION_AGENT_TOKEN_SHA256

afterEach(() => {
  if (ORIGINAL_TOKEN_HASH === undefined) {
    delete process.env.AUTOMATION_AGENT_TOKEN_SHA256
  } else {
    process.env.AUTOMATION_AGENT_TOKEN_SHA256 = ORIGINAL_TOKEN_HASH
  }
})

describe("automation agent authentication", () => {
  it("accepts only the configured token and a constrained agent id", () => {
    const token = "local-agent-test-token"
    process.env.AUTOMATION_AGENT_TOKEN_SHA256 = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex")

    const validRequest = new Request("https://autolisty.com/api/automation/agent/heartbeat", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "x-autolisty-agent-id": "old-production-pc",
      },
    })
    expect(authenticateAutomationAgent(validRequest)).toEqual({
      agentId: "old-production-pc",
    })

    const invalidRequest = new Request("https://autolisty.com/api/automation/agent/heartbeat", {
      method: "POST",
      headers: {
        authorization: "Bearer incorrect-token",
        "x-autolisty-agent-id": "old-production-pc",
      },
    })
    expect(authenticateAutomationAgent(invalidRequest)).toBeNull()
  })

  it("rejects missing configuration and malformed agent ids", () => {
    delete process.env.AUTOMATION_AGENT_TOKEN_SHA256
    const request = new Request("https://autolisty.com/api/automation/agent/heartbeat", {
      headers: {
        authorization: "Bearer token",
        "x-autolisty-agent-id": "../old-pc",
      },
    })
    expect(authenticateAutomationAgent(request)).toBeNull()
  })
})
