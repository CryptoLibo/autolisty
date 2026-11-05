import crypto from "node:crypto"

// Verificación WebAuthn (passkeys) sin dependencias externas, según la
// especificación W3C WebAuthn Level 2. Solo lo que Autolisty necesita:
// - Registro con attestation "none" (no se verifica el fabricante del dispositivo;
//   el registro ya está protegido por la sesión del propietario o el código de configuración).
// - Autenticación con firma ES256 (Apple, Android, Windows Hello), RS256 o EdDSA.

export class WebAuthnError extends Error {}

// ---------- base64url ----------

export function toBase64Url(bytes: Uint8Array | Buffer) {
  return Buffer.from(bytes).toString("base64url")
}

export function fromBase64Url(value: string) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]*={0,2}$/.test(value)) {
    throw new WebAuthnError("Invalid base64url value.")
  }
  return Buffer.from(value, "base64url")
}

// ---------- CBOR (subconjunto suficiente para WebAuthn) ----------

type CborValue = number | bigint | string | boolean | null | Buffer | CborValue[] | Map<CborValue, CborValue>

export function decodeCbor(data: Buffer, start = 0): { value: CborValue; offset: number } {
  let offset = start

  function readLength(additional: number): number {
    if (additional < 24) return additional
    if (additional === 24) return data.readUInt8(offset++)
    if (additional === 25) {
      const value = data.readUInt16BE(offset)
      offset += 2
      return value
    }
    if (additional === 26) {
      const value = data.readUInt32BE(offset)
      offset += 4
      return value
    }
    if (additional === 27) {
      const value = data.readBigUInt64BE(offset)
      offset += 8
      if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new WebAuthnError("CBOR length too large.")
      return Number(value)
    }
    throw new WebAuthnError("Unsupported CBOR length encoding.")
  }

  function readItem(depth: number): CborValue {
    if (depth > 16) throw new WebAuthnError("CBOR nesting too deep.")
    if (offset >= data.length) throw new WebAuthnError("Truncated CBOR data.")
    const initial = data.readUInt8(offset++)
    const major = initial >> 5
    const additional = initial & 0x1f
    switch (major) {
      case 0:
        return readLength(additional)
      case 1:
        return -1 - readLength(additional)
      case 2: {
        const length = readLength(additional)
        if (offset + length > data.length) throw new WebAuthnError("Truncated CBOR byte string.")
        const value = data.subarray(offset, offset + length)
        offset += length
        return Buffer.from(value)
      }
      case 3: {
        const length = readLength(additional)
        if (offset + length > data.length) throw new WebAuthnError("Truncated CBOR text string.")
        const value = data.subarray(offset, offset + length).toString("utf8")
        offset += length
        return value
      }
      case 4: {
        const length = readLength(additional)
        const items: CborValue[] = []
        for (let index = 0; index < length; index += 1) items.push(readItem(depth + 1))
        return items
      }
      case 5: {
        const length = readLength(additional)
        const map = new Map<CborValue, CborValue>()
        for (let index = 0; index < length; index += 1) {
          const key = readItem(depth + 1)
          map.set(key, readItem(depth + 1))
        }
        return map
      }
      case 7:
        if (additional === 20) return false
        if (additional === 21) return true
        if (additional === 22) return null
        throw new WebAuthnError("Unsupported CBOR simple value.")
      default:
        throw new WebAuthnError("Unsupported CBOR type.")
    }
  }

  const value = readItem(0)
  return { value, offset }
}

// ---------- authenticatorData ----------

export type ParsedAuthenticatorData = {
  rpIdHash: Buffer
  userPresent: boolean
  userVerified: boolean
  signCount: number
  credentialId: Buffer | null
  credentialPublicKey: Map<CborValue, CborValue> | null
}

export function parseAuthenticatorData(authData: Buffer): ParsedAuthenticatorData {
  if (authData.length < 37) throw new WebAuthnError("Authenticator data is too short.")
  const flags = authData.readUInt8(32)
  const parsed: ParsedAuthenticatorData = {
    rpIdHash: authData.subarray(0, 32),
    userPresent: Boolean(flags & 0x01),
    userVerified: Boolean(flags & 0x04),
    signCount: authData.readUInt32BE(33),
    credentialId: null,
    credentialPublicKey: null,
  }
  if (flags & 0x40) {
    let offset = 37 + 16 // aaguid
    if (authData.length < offset + 2) throw new WebAuthnError("Missing credential data.")
    const idLength = authData.readUInt16BE(offset)
    offset += 2
    if (idLength < 16 || idLength > 1023 || authData.length < offset + idLength) {
      throw new WebAuthnError("Invalid credential id.")
    }
    parsed.credentialId = Buffer.from(authData.subarray(offset, offset + idLength))
    offset += idLength
    const { value } = decodeCbor(authData, offset)
    if (!(value instanceof Map)) throw new WebAuthnError("Invalid credential public key.")
    parsed.credentialPublicKey = value
  }
  return parsed
}

// ---------- COSE -> JWK ----------

export type StoredPublicKey = { alg: -7 | -257 | -8; jwk: crypto.JsonWebKey }

export function coseToPublicKey(cose: Map<CborValue, CborValue>): StoredPublicKey {
  const kty = cose.get(1)
  const alg = cose.get(3)
  const bytes = (key: number) => {
    const value = cose.get(key)
    if (!Buffer.isBuffer(value)) throw new WebAuthnError("Malformed COSE key.")
    return value.toString("base64url")
  }
  if (kty === 2 && alg === -7 && cose.get(-1) === 1) {
    return { alg: -7, jwk: { kty: "EC", crv: "P-256", x: bytes(-2), y: bytes(-3) } }
  }
  if (kty === 3 && alg === -257) {
    return { alg: -257, jwk: { kty: "RSA", n: bytes(-1), e: bytes(-2) } }
  }
  if (kty === 1 && alg === -8 && cose.get(-1) === 6) {
    return { alg: -8, jwk: { kty: "OKP", crv: "Ed25519", x: bytes(-2) } }
  }
  throw new WebAuthnError("Unsupported passkey algorithm.")
}

function verifySignature(publicKey: StoredPublicKey, data: Buffer, signature: Buffer) {
  const key = crypto.createPublicKey({ key: publicKey.jwk, format: "jwk" })
  if (publicKey.alg === -7) return crypto.verify("sha256", data, { key, dsaEncoding: "der" }, signature)
  if (publicKey.alg === -257) return crypto.verify("sha256", data, key, signature)
  return crypto.verify(null, data, key, signature)
}

// ---------- ceremonias ----------

type Expected = { challenge: string; origin: string; rpId: string }

function checkClientData(clientDataJSON: Buffer, type: string, expected: Expected) {
  let clientData: { type?: string; challenge?: string; origin?: string; crossOrigin?: boolean }
  try {
    clientData = JSON.parse(clientDataJSON.toString("utf8"))
  } catch {
    throw new WebAuthnError("Invalid client data.")
  }
  if (clientData.type !== type) throw new WebAuthnError("Unexpected WebAuthn ceremony type.")
  if (clientData.challenge !== expected.challenge) throw new WebAuthnError("Challenge mismatch.")
  if (clientData.origin !== expected.origin) throw new WebAuthnError("Origin mismatch.")
  if (clientData.crossOrigin) throw new WebAuthnError("Cross-origin requests are not allowed.")
}

function checkAuthenticatorData(authData: ParsedAuthenticatorData, rpId: string) {
  const expectedHash = crypto.createHash("sha256").update(rpId).digest()
  if (!crypto.timingSafeEqual(authData.rpIdHash, expectedHash)) throw new WebAuthnError("Relying party mismatch.")
  if (!authData.userPresent) throw new WebAuthnError("User presence is required.")
  if (!authData.userVerified) throw new WebAuthnError("User verification (Face ID, fingerprint or PIN) is required.")
}

export function verifyRegistration(input: {
  clientDataJSON: string
  attestationObject: string
  expected: Expected
}) {
  const clientDataJSON = fromBase64Url(input.clientDataJSON)
  checkClientData(clientDataJSON, "webauthn.create", input.expected)
  const { value } = decodeCbor(fromBase64Url(input.attestationObject))
  if (!(value instanceof Map)) throw new WebAuthnError("Invalid attestation object.")
  const authDataBytes = value.get("authData")
  if (!Buffer.isBuffer(authDataBytes)) throw new WebAuthnError("Missing authenticator data.")
  const authData = parseAuthenticatorData(authDataBytes)
  checkAuthenticatorData(authData, input.expected.rpId)
  if (!authData.credentialId || !authData.credentialPublicKey) throw new WebAuthnError("Missing credential.")
  return {
    credentialId: toBase64Url(authData.credentialId),
    publicKey: coseToPublicKey(authData.credentialPublicKey),
    signCount: authData.signCount,
  }
}

export function verifyAuthentication(input: {
  clientDataJSON: string
  authenticatorData: string
  signature: string
  publicKey: StoredPublicKey
  storedSignCount: number
  expected: Expected
}) {
  const clientDataJSON = fromBase64Url(input.clientDataJSON)
  checkClientData(clientDataJSON, "webauthn.get", input.expected)
  const authDataBytes = fromBase64Url(input.authenticatorData)
  const authData = parseAuthenticatorData(authDataBytes)
  checkAuthenticatorData(authData, input.expected.rpId)
  const signedData = Buffer.concat([authDataBytes, crypto.createHash("sha256").update(clientDataJSON).digest()])
  if (!verifySignature(input.publicKey, signedData, fromBase64Url(input.signature))) {
    throw new WebAuthnError("Invalid passkey signature.")
  }
  // Contador anti-clonado: si el dispositivo lo usa (>0), debe crecer siempre.
  if (authData.signCount > 0 || input.storedSignCount > 0) {
    if (authData.signCount <= input.storedSignCount) throw new WebAuthnError("Passkey counter did not increase.")
  }
  return { signCount: authData.signCount }
}
