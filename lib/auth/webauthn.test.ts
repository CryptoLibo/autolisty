import crypto from "node:crypto"
import { describe, expect, it } from "vitest"
import { decodeCbor, verifyAuthentication, verifyRegistration, WebAuthnError } from "./webauthn"

// Autenticador de software: reproduce lo que hace un iPhone o Windows Hello.

function cborHead(major: number, length: number) {
  if (length < 24) return Buffer.from([(major << 5) | length])
  if (length < 256) return Buffer.from([(major << 5) | 24, length])
  const buffer = Buffer.alloc(3)
  buffer[0] = (major << 5) | 25
  buffer.writeUInt16BE(length, 1)
  return buffer
}

function cbor(value: unknown): Buffer {
  if (typeof value === "number") return value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value)
  if (typeof value === "string") return Buffer.concat([cborHead(3, Buffer.byteLength(value)), Buffer.from(value)])
  if (Buffer.isBuffer(value)) return Buffer.concat([cborHead(2, value.length), value])
  if (value instanceof Map) {
    const parts: Buffer[] = [cborHead(5, value.size)]
    for (const [key, item] of value) parts.push(cbor(key), cbor(item))
    return Buffer.concat(parts)
  }
  throw new Error("unsupported")
}

const RP_ID = "autolisty.com"
const ORIGIN = "https://autolisty.com"
const rpIdHash = crypto.createHash("sha256").update(RP_ID).digest()

function createAuthenticator() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" })
  const jwk = publicKey.export({ format: "jwk" })
  const credentialId = crypto.randomBytes(32)
  const coseKey = new Map<number, unknown>([
    [1, 2],
    [3, -7],
    [-1, 1],
    [-2, Buffer.from(jwk.x!, "base64url")],
    [-3, Buffer.from(jwk.y!, "base64url")],
  ])
  return { privateKey, credentialId, coseKey }
}

function authData(flags: number, signCount: number, attested?: { credentialId: Buffer; coseKey: Map<number, unknown> }) {
  const counter = Buffer.alloc(4)
  counter.writeUInt32BE(signCount)
  const parts: Buffer[] = [rpIdHash, Buffer.from([flags]), counter]
  if (attested) {
    const length = Buffer.alloc(2)
    length.writeUInt16BE(attested.credentialId.length)
    parts.push(Buffer.alloc(16), length, attested.credentialId, cbor(attested.coseKey))
  }
  return Buffer.concat(parts)
}

function clientData(type: string, challenge: string, origin = ORIGIN) {
  return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }))
}

function register(authenticator = createAuthenticator(), challenge = "register-challenge") {
  const attestationObject = cbor(
    new Map<string, unknown>([
      ["fmt", "none"],
      ["attStmt", new Map()],
      ["authData", authData(0x45, 0, authenticator)],
    ])
  )
  return verifyRegistration({
    clientDataJSON: clientData("webauthn.create", challenge).toString("base64url"),
    attestationObject: attestationObject.toString("base64url"),
    expected: { challenge, origin: ORIGIN, rpId: RP_ID },
  })
}

function sign(authenticator: ReturnType<typeof createAuthenticator>, challenge: string, signCount: number, origin = ORIGIN) {
  const data = authData(0x05, signCount)
  const client = clientData("webauthn.get", challenge, origin)
  const signature = crypto.sign("sha256", Buffer.concat([data, crypto.createHash("sha256").update(client).digest()]), {
    key: authenticator.privateKey,
    dsaEncoding: "der",
  })
  return {
    clientDataJSON: client.toString("base64url"),
    authenticatorData: data.toString("base64url"),
    signature: signature.toString("base64url"),
  }
}

describe("WebAuthn passkeys", () => {
  it("decodes CBOR maps with negative integer keys", () => {
    const { value } = decodeCbor(cbor(new Map<number, unknown>([[1, 2], [-1, 1], [-2, Buffer.from([1, 2])]])))
    expect(value).toBeInstanceOf(Map)
    expect((value as Map<number, unknown>).get(-1)).toBe(1)
  })

  it("registers a passkey and then signs in with it", () => {
    const authenticator = createAuthenticator()
    const registered = register(authenticator)
    expect(registered.credentialId).toBe(authenticator.credentialId.toString("base64url"))
    expect(registered.publicKey.alg).toBe(-7)

    const assertion = sign(authenticator, "login-challenge", 0)
    expect(
      verifyAuthentication({
        ...assertion,
        publicKey: registered.publicKey,
        storedSignCount: 0,
        expected: { challenge: "login-challenge", origin: ORIGIN, rpId: RP_ID },
      })
    ).toEqual({ signCount: 0 })
  })

  it("rejects a wrong challenge, a foreign origin or another device's signature", () => {
    const authenticator = createAuthenticator()
    const registered = register(authenticator)
    const expected = { challenge: "login-challenge", origin: ORIGIN, rpId: RP_ID }

    expect(() =>
      verifyAuthentication({ ...sign(authenticator, "other", 0), publicKey: registered.publicKey, storedSignCount: 0, expected })
    ).toThrow(/Challenge/)
    expect(() =>
      verifyAuthentication({
        ...sign(authenticator, "login-challenge", 0, "https://evil.example"),
        publicKey: registered.publicKey,
        storedSignCount: 0,
        expected,
      })
    ).toThrow(/Origin/)
    expect(() =>
      verifyAuthentication({
        ...sign(createAuthenticator(), "login-challenge", 0),
        publicKey: registered.publicKey,
        storedSignCount: 0,
        expected,
      })
    ).toThrow(/signature/)
  })

  it("rejects a cloned authenticator whose counter goes backwards", () => {
    const authenticator = createAuthenticator()
    const registered = register(authenticator)
    expect(() =>
      verifyAuthentication({
        ...sign(authenticator, "c", 4),
        publicKey: registered.publicKey,
        storedSignCount: 5,
        expected: { challenge: "c", origin: ORIGIN, rpId: RP_ID },
      })
    ).toThrow(/counter/)
  })

  it("requires user verification and the right ceremony type", () => {
    const authenticator = createAuthenticator()
    const attestationObject = cbor(
      new Map<string, unknown>([
        ["fmt", "none"],
        ["attStmt", new Map()],
        ["authData", authData(0x41, 0, authenticator)], // sin UV
      ])
    )
    expect(() =>
      verifyRegistration({
        clientDataJSON: clientData("webauthn.create", "x").toString("base64url"),
        attestationObject: attestationObject.toString("base64url"),
        expected: { challenge: "x", origin: ORIGIN, rpId: RP_ID },
      })
    ).toThrow(WebAuthnError)
    expect(() =>
      verifyRegistration({
        clientDataJSON: clientData("webauthn.get", "x").toString("base64url"),
        attestationObject: attestationObject.toString("base64url"),
        expected: { challenge: "x", origin: ORIGIN, rpId: RP_ID },
      })
    ).toThrow(/ceremony/)
  })
})
