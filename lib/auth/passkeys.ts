import crypto from "node:crypto"
import type Database from "better-sqlite3"
import { getAutomationDatabase } from "../automation/db/database"
import { toBase64Url, type StoredPublicKey } from "./webauthn"

// Passkeys del propietario y desafíos de un solo uso (5 minutos).

const CHALLENGE_TTL_MS = 5 * 60 * 1000

export type Passkey = {
  id: string
  publicKey: StoredPublicKey
  signCount: number
  name: string | null
  createdAt: string
  lastUsedAt: string | null
}

type PasskeyRow = {
  id: string
  public_key_json: string
  sign_count: number
  name: string | null
  created_at: string
  last_used_at: string | null
}

function mapPasskey(row: PasskeyRow): Passkey {
  return {
    id: row.id,
    publicKey: JSON.parse(row.public_key_json) as StoredPublicKey,
    signCount: row.sign_count,
    name: row.name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }
}

export function getPasskeyConfig() {
  const origin = new URL(process.env.AUTOLISTY_PUBLIC_URL || process.env.AUTH_URL || "https://autolisty.com").origin
  return { origin, rpId: new URL(origin).hostname, rpName: "Autolisty" }
}

// Código de configuración: permite registrar un dispositivo sin sesión
// (primera vez o recuperación). El servidor solo guarda su SHA-256.
export function isValidSetupCode(code: unknown) {
  const expected = (process.env.AUTOLISTY_SETUP_CODE_SHA256 || "").trim().toLowerCase()
  if (typeof code !== "string" || !code.trim() || !/^[a-f0-9]{64}$/.test(expected)) return false
  const received = crypto.createHash("sha256").update(code.trim(), "utf8").digest()
  return crypto.timingSafeEqual(received, Buffer.from(expected, "hex"))
}

export class PasskeyStore {
  constructor(private readonly database: Database.Database = getAutomationDatabase()) {}

  createChallenge(purpose: "register" | "login") {
    const now = Date.now()
    this.database.prepare("DELETE FROM auth_challenges WHERE expires_at < ?").run(new Date(now).toISOString())
    const id = crypto.randomUUID()
    const challenge = toBase64Url(crypto.randomBytes(32))
    this.database
      .prepare("INSERT INTO auth_challenges (id, challenge, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, challenge, purpose, new Date(now + CHALLENGE_TTL_MS).toISOString(), new Date(now).toISOString())
    return { id, challenge }
  }

  // Un desafío solo se puede usar una vez.
  consumeChallenge(id: unknown, purpose: "register" | "login") {
    if (typeof id !== "string") return null
    const consume = this.database.transaction(() => {
      const row = this.database
        .prepare("SELECT challenge, purpose, expires_at FROM auth_challenges WHERE id = ?")
        .get(id) as { challenge: string; purpose: string; expires_at: string } | undefined
      this.database.prepare("DELETE FROM auth_challenges WHERE id = ?").run(id)
      if (!row || row.purpose !== purpose || row.expires_at < new Date().toISOString()) return null
      return row.challenge
    })
    return consume()
  }

  list() {
    return (this.database.prepare("SELECT * FROM auth_passkeys ORDER BY created_at ASC").all() as PasskeyRow[]).map(mapPasskey)
  }

  get(id: string) {
    const row = this.database.prepare("SELECT * FROM auth_passkeys WHERE id = ?").get(id) as PasskeyRow | undefined
    return row ? mapPasskey(row) : null
  }

  add(input: { id: string; publicKey: StoredPublicKey; signCount: number; name: string | null }) {
    this.database
      .prepare("INSERT INTO auth_passkeys (id, public_key_json, sign_count, name, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(input.id, JSON.stringify(input.publicKey), input.signCount, input.name?.slice(0, 80) || null, new Date().toISOString())
    return this.get(input.id)!
  }

  recordUse(id: string, signCount: number) {
    this.database
      .prepare("UPDATE auth_passkeys SET sign_count = ?, last_used_at = ? WHERE id = ?")
      .run(signCount, new Date().toISOString(), id)
  }

  remove(id: string) {
    return this.database.prepare("DELETE FROM auth_passkeys WHERE id = ?").run(id).changes === 1
  }
}
