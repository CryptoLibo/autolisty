import crypto from "node:crypto"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import type Database from "better-sqlite3"
import { openAutomationDatabase } from "../automation/db/database"
import {
  buildVapidAuthorization,
  getVapidKeys,
  isAllowedPushEndpoint,
  notifyOwner,
  saveSubscription,
  takePendingNotificationsFor,
} from "./webPush"

beforeAll(() => {
  process.env.AUTH_SECRET = "z".repeat(43)
})

describe("web push", () => {
  let database: Database.Database | null = null
  afterEach(() => {
    database?.close()
    database = null
    vi.unstubAllGlobals()
  })

  it("genera una sola vez las claves VAPID y firma un JWT ES256 verificable", () => {
    database = openAutomationDatabase(":memory:")
    const keys = getVapidKeys(database)
    expect(getVapidKeys(database).publicKey).toBe(keys.publicKey)
    expect(Buffer.from(keys.publicKey, "base64url")).toHaveLength(65)

    const header = buildVapidAuthorization("https://web.push.apple.com/abc", keys, Date.UTC(2026, 0, 1))
    const [, token, publicKey] = header.match(/^vapid t=([^,]+), k=(.+)$/)!
    expect(publicKey).toBe(keys.publicKey)
    const [h, c, signature] = token.split(".")
    const claims = JSON.parse(Buffer.from(c, "base64url").toString())
    expect(claims.aud).toBe("https://web.push.apple.com")
    const raw = Buffer.from(keys.publicKey, "base64url")
    const verifyKey = crypto.createPublicKey({
      key: { kty: "EC", crv: "P-256", x: raw.subarray(1, 33).toString("base64url"), y: raw.subarray(33).toString("base64url") },
      format: "jwk",
    })
    expect(crypto.verify("sha256", Buffer.from(`${h}.${c}`), { key: verifyKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"))).toBe(true)
  })

  it("solo acepta servicios push conocidos", () => {
    expect(isAllowedPushEndpoint("https://web.push.apple.com/QGx")).toBe(true)
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/x")).toBe(true)
    expect(isAllowedPushEndpoint("https://evil.example/push")).toBe(false)
    expect(isAllowedPushEndpoint("http://web.push.apple.com/x")).toBe(false)
  })

  it("guarda la notificación, despierta al móvil sin cuerpo y la entrega una sola vez", async () => {
    database = openAutomationDatabase(":memory:")
    saveSubscription({ endpoint: "https://web.push.apple.com/device", keys: { p256dh: "p", auth: "a" } }, "iPhone", database)
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }))
    vi.stubGlobal("fetch", fetchMock)

    await notifyOwner({ title: "Draft listo", body: "LBCreaStudio-ABC123", url: "/automation" }, database)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://web.push.apple.com/device")
    expect(init.body).toBeUndefined()
    expect(String((init.headers as Record<string, string>).Authorization)).toMatch(/^vapid t=/)
    expect(takePendingNotificationsFor("https://web.push.apple.com/device", database)!.map((item) => item.title)).toEqual(["Draft listo"])
    expect(takePendingNotificationsFor("https://web.push.apple.com/device", database)).toEqual([])
    expect(takePendingNotificationsFor("https://web.push.apple.com/unknown", database)).toBeNull()
  })

  it("cada dispositivo recibe todas las notificaciones, pero no las anteriores a activarse", async () => {
    database = openAutomationDatabase(":memory:")
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 201 })))
    await notifyOwner({ title: "vieja", body: "x" }, database)
    saveSubscription({ endpoint: "https://web.push.apple.com/a", keys: { p256dh: "p", auth: "a" } }, null, database)
    saveSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/b", keys: { p256dh: "p", auth: "a" } }, null, database)
    await notifyOwner({ title: "nueva", body: "y" }, database)
    expect(takePendingNotificationsFor("https://web.push.apple.com/a", database)!.map((item) => item.title)).toEqual(["nueva"])
    expect(takePendingNotificationsFor("https://fcm.googleapis.com/fcm/send/b", database)!.map((item) => item.title)).toEqual(["nueva"])
  })

  it("olvida los dispositivos que el servicio push da por caducados", async () => {
    database = openAutomationDatabase(":memory:")
    saveSubscription({ endpoint: "https://web.push.apple.com/old", keys: { p256dh: "p", auth: "a" } }, null, database)
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 410 })))
    await notifyOwner({ title: "x", body: "y" }, database)
    expect(database.prepare("SELECT COUNT(*) AS count FROM push_subscriptions").get()).toEqual({ count: 0 })
  })
})
