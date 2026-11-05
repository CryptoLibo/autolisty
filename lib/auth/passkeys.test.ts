import crypto from "node:crypto"
import { afterEach, describe, expect, it } from "vitest"
import type Database from "better-sqlite3"
import { openAutomationDatabase } from "../automation/db/database"
import { isValidSetupCode, PasskeyStore } from "./passkeys"

const ORIGINAL = process.env.AUTOLISTY_SETUP_CODE_SHA256

describe("passkey store", () => {
  let database: Database.Database | null = null

  afterEach(() => {
    database?.close()
    database = null
    if (ORIGINAL === undefined) delete process.env.AUTOLISTY_SETUP_CODE_SHA256
    else process.env.AUTOLISTY_SETUP_CODE_SHA256 = ORIGINAL
  })

  it("uses each challenge once and only for its purpose", () => {
    database = openAutomationDatabase(":memory:")
    const store = new PasskeyStore(database)
    const login = store.createChallenge("login")
    expect(store.consumeChallenge(login.id, "register")).toBeNull()
    const again = store.createChallenge("login")
    expect(store.consumeChallenge(again.id, "login")).toBe(again.challenge)
    expect(store.consumeChallenge(again.id, "login")).toBeNull()
  })

  it("stores passkeys and updates their counter", () => {
    database = openAutomationDatabase(":memory:")
    const store = new PasskeyStore(database)
    store.add({ id: "cred", publicKey: { alg: -7, jwk: { kty: "EC" } }, signCount: 0, name: "iPhone" })
    store.recordUse("cred", 3)
    expect(store.get("cred")).toMatchObject({ name: "iPhone", signCount: 3 })
    expect(store.list()).toHaveLength(1)
  })

  it("accepts only the configured setup code", () => {
    process.env.AUTOLISTY_SETUP_CODE_SHA256 = crypto.createHash("sha256").update("my-setup-code").digest("hex")
    expect(isValidSetupCode("my-setup-code")).toBe(true)
    expect(isValidSetupCode(" my-setup-code ")).toBe(true)
    expect(isValidSetupCode("wrong")).toBe(false)
    expect(isValidSetupCode(undefined)).toBe(false)
    delete process.env.AUTOLISTY_SETUP_CODE_SHA256
    expect(isValidSetupCode("my-setup-code")).toBe(false)
  })
})
