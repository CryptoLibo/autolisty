// Bóveda de credenciales de Etsy y Pinterest en el servidor.
//
// Hasta ahora los tokens solo vivían en cookies del navegador, así que el
// servidor no podía trabajar sin una pestaña abierta. Aquí se guardan cifrados
// (AES-256-GCM) en la base de Automation. La clave sale de AUTH_SECRET (HKDF) o
// de CREDENTIALS_ENCRYPTION_KEY si existe. Si la clave cambia, los tokens dejan
// de poder leerse y basta con reconectar Etsy/Pinterest una vez.
import crypto from "node:crypto"
import type Database from "better-sqlite3"
import { getAutomationDatabase } from "../automation/db/database"

export type CredentialProvider = "etsy" | "pinterest"

const VERSION_PREFIX = "v1"

function deriveKey(secret: string) {
  return Buffer.from(crypto.hkdfSync("sha256", secret, "autolisty", "integration-credentials-v1", 32))
}

// Clave propia (CREDENTIALS_ENCRYPTION_KEY), separada de la que firma sesiones (AUTH_SECRET).
// Lo cifrado antes con AUTH_SECRET se sigue leyendo y se vuelve a cifrar con la clave nueva.
function getKey() {
  const secret = process.env.CREDENTIALS_ENCRYPTION_KEY || process.env.AUTH_SECRET || ""
  if (secret.length < 32) {
    throw new Error("AUTH_SECRET (or CREDENTIALS_ENCRYPTION_KEY) must be at least 32 characters.")
  }
  return deriveKey(secret)
}

function legacyKey() {
  const legacy = process.env.AUTH_SECRET || ""
  if (!process.env.CREDENTIALS_ENCRYPTION_KEY || legacy.length < 32 || legacy === process.env.CREDENTIALS_ENCRYPTION_KEY) return null
  return deriveKey(legacy)
}

export function encryptCredential(provider: CredentialProvider | "vapid", payload: unknown) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv)
  cipher.setAAD(Buffer.from(provider))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()])
  return [VERSION_PREFIX, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".")
}

function decryptWith<T>(key: Buffer, provider: string, iv: string, tag: string, data: string): T {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"))
  decipher.setAAD(Buffer.from(provider))
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  const plain = Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()])
  return JSON.parse(plain.toString("utf8")) as T
}

/** Descifra; `legacy` indica que se cifró con AUTH_SECRET y conviene volver a cifrarlo. */
export function decryptCredentialDetailed<T>(provider: CredentialProvider | "vapid", value: string): { value: T; legacy: boolean } {
  const [version, iv, tag, data] = value.split(".")
  if (version !== VERSION_PREFIX || !iv || !tag || !data) throw new Error("Unsupported credential format.")
  try {
    return { value: decryptWith<T>(getKey(), provider, iv, tag, data), legacy: false }
  } catch (error) {
    const legacy = legacyKey()
    if (!legacy) throw error
    return { value: decryptWith<T>(legacy, provider, iv, tag, data), legacy: true }
  }
}

export function decryptCredential<T>(provider: CredentialProvider | "vapid", value: string): T {
  return decryptCredentialDetailed<T>(provider, value).value
}

export function readCredential<T>(provider: CredentialProvider, database: Database.Database = getAutomationDatabase()): T | null {
  const row = database
    .prepare("SELECT ciphertext FROM integration_credentials WHERE provider = ?")
    .get(provider) as { ciphertext: string } | undefined
  if (!row) return null
  try {
    const { value, legacy } = decryptCredentialDetailed<T>(provider, row.ciphertext)
    if (legacy) writeCredential(provider, value, database)
    return value
  } catch {
    // Clave cambiada o dato dañado: se trata como "no conectado".
    return null
  }
}

export function writeCredential(provider: CredentialProvider, payload: unknown, database: Database.Database = getAutomationDatabase()) {
  database.prepare(`
    INSERT INTO integration_credentials (provider, ciphertext, revision, updated_at)
    VALUES (@provider, @ciphertext, 1, @now)
    ON CONFLICT(provider) DO UPDATE SET
      ciphertext = excluded.ciphertext,
      revision = integration_credentials.revision + 1,
      updated_at = excluded.updated_at
  `).run({ provider, ciphertext: encryptCredential(provider, payload), now: new Date().toISOString() })
}

export function deleteCredential(provider: CredentialProvider, database: Database.Database = getAutomationDatabase()) {
  database.prepare("DELETE FROM integration_credentials WHERE provider = ?").run(provider)
}
