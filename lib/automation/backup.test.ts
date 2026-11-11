import { describe, expect, it } from "vitest"
import { decryptBackup, encryptBackup } from "./backup"

describe("backup encryption", () => {
  it("cifra y descifra; falla con otra contraseña", () => {
    const plain = Buffer.from("SQLite format 3\u0000 datos de prueba".repeat(50))
    const passphrase = "a-very-long-backup-passphrase-for-tests!!"
    const encrypted = encryptBackup(plain, passphrase)
    expect(encrypted.includes(plain.subarray(0, 20))).toBe(false)
    expect(decryptBackup(encrypted, passphrase).equals(plain)).toBe(true)
    expect(() => decryptBackup(encrypted, "another-passphrase-that-is-long-enough!!")).toThrow()
  })
})
