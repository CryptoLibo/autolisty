import { describe, expect, it } from "vitest"
import { expectedRequestOrigin } from "./request-origin"

describe("request origin behind a reverse proxy", () => {
  it("uses the configured HTTPS origin instead of the internal HTTP origin", () => {
    expect(expectedRequestOrigin("autolisty.com", "http://autolisty.com", "https://autolisty.com", false)).toBe("https://autolisty.com")
  })

  it("rejects a different host or insecure public URL", () => {
    expect(expectedRequestOrigin("attacker.example", "http://attacker.example", "https://autolisty.com", false)).toBeNull()
    expect(expectedRequestOrigin("autolisty.com", "http://autolisty.com", "http://autolisty.com", false)).toBeNull()
  })

  it("keeps local development and the legacy fallback", () => {
    expect(expectedRequestOrigin("127.0.0.1:3000", "http://127.0.0.1:3000", undefined, true)).toBe("http://127.0.0.1:3000")
    expect(expectedRequestOrigin("autolisty.com", "https://autolisty.com", undefined, false)).toBe("https://autolisty.com")
  })
})
