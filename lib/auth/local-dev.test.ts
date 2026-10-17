import { describe, expect, it } from "vitest"
import { isLocalDevAccess } from "./local-dev"

describe("local development access", () => {
  it("requires an explicit flag, development mode, and the loopback hostname", () => {
    expect(isLocalDevAccess("127.0.0.1", "development", "1")).toBe(true)
    expect(isLocalDevAccess("localhost", "development", "1")).toBe(false)
    expect(isLocalDevAccess("example.com", "development", "1")).toBe(false)
    expect(isLocalDevAccess("127.0.0.1", "production", "1")).toBe(false)
    expect(isLocalDevAccess("127.0.0.1", "development", undefined)).toBe(false)
  })
})
