import { describe, expect, it } from "vitest"
import { openAutomationDatabase } from "../automation/db/database"
import { isSessionActive, revokeAllSessions } from "./sessionRevocation"

describe("session revocation", () => {
  it("una sesión deja de valer si se borra su passkey o se cierran todas", () => {
    const db = openAutomationDatabase(":memory:")
    db.prepare("INSERT INTO auth_passkeys (id, public_key_json, sign_count, name, created_at) VALUES ('pk1', '{}', 0, null, '2026-01-01')").run()
    const iat = 1_800_000_000
    expect(isSessionActive({ cid: "pk1", iat }, db)).toBe(true)
    expect(isSessionActive({ cid: "otro", iat }, db)).toBe(false)
    revokeAllSessions(db, (iat + 10) * 1000)
    expect(isSessionActive({ cid: "pk1", iat }, db)).toBe(false)
    expect(isSessionActive({ cid: "pk1", iat: iat + 20 }, db)).toBe(true)
  })
})
