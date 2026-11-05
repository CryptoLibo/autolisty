import { describe, expect, it } from "vitest"
import { createSessionToken, SESSION_MAX_AGE_SECONDS, verifySessionToken } from "./session"

const SECRET = "x".repeat(48)

describe("owner session token", () => {
  it("verifies a fresh token and rejects tampering", async () => {
    const token = await createSessionToken("cred-1", { secret: SECRET })
    expect((await verifySessionToken(token, { secret: SECRET }))?.cid).toBe("cred-1")

    const [body, signature] = token.split(".")
    const forged = Buffer.from(JSON.stringify({ v: 1, sub: "owner", cid: "x", iat: 0, exp: 9_999_999_999 })).toString("base64url")
    expect(await verifySessionToken(`${forged}.${signature}`, { secret: SECRET })).toBeNull()
    expect(await verifySessionToken(`${body}.${signature}x`, { secret: SECRET })).toBeNull()
    expect(await verifySessionToken(token, { secret: "y".repeat(48) })).toBeNull()
    expect(await verifySessionToken("garbage", { secret: SECRET })).toBeNull()
  })

  it("expires after 30 days", async () => {
    const now = Date.UTC(2026, 10, 5)
    const token = await createSessionToken("cred-1", { secret: SECRET, now })
    expect(await verifySessionToken(token, { secret: SECRET, now: now + (SESSION_MAX_AGE_SECONDS - 60) * 1000 })).not.toBeNull()
    expect(await verifySessionToken(token, { secret: SECRET, now: now + (SESSION_MAX_AGE_SECONDS + 1) * 1000 })).toBeNull()
  })
})
