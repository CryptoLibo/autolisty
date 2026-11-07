import { beforeAll, describe, expect, it } from "vitest"
import { openAutomationDatabase } from "../automation/db/database"
import { decryptCredential, deleteCredential, encryptCredential, readCredential, writeCredential } from "./credentialVault"

beforeAll(() => {
  process.env.AUTH_SECRET = "x".repeat(43)
})

describe("credential vault", () => {
  it("cifra con AES-GCM ligado al proveedor y sin texto en claro", () => {
    const value = encryptCredential("etsy", { access_token: "secret-access", refresh_token: "secret-refresh" })
    expect(value).not.toContain("secret")
    expect(decryptCredential("etsy", value)).toEqual({ access_token: "secret-access", refresh_token: "secret-refresh" })
    expect(() => decryptCredential("pinterest", value)).toThrow()
  })

  it("guarda, actualiza y borra por proveedor", () => {
    const database = openAutomationDatabase(":memory:")
    expect(readCredential("etsy", database)).toBeNull()
    writeCredential("etsy", { access_token: "a" }, database)
    writeCredential("etsy", { access_token: "b" }, database)
    expect(readCredential<{ access_token: string }>("etsy", database)?.access_token).toBe("b")
    const row = database.prepare("SELECT revision FROM integration_credentials WHERE provider = 'etsy'").get() as { revision: number }
    expect(row.revision).toBe(2)
    deleteCredential("etsy", database)
    expect(readCredential("etsy", database)).toBeNull()
  })

  it("trata como desconectado un dato que ya no se puede descifrar", () => {
    const database = openAutomationDatabase(":memory:")
    writeCredential("pinterest", { access_token: "a" }, database)
    process.env.AUTH_SECRET = "y".repeat(43)
    expect(readCredential("pinterest", database)).toBeNull()
    process.env.AUTH_SECRET = "x".repeat(43)
  })
})
