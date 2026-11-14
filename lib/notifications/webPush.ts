// Notificaciones push al móvil (app web instalada en la pantalla de inicio).
//
// Sin dependencias: Web Push con autenticación VAPID (JWT ES256) y SIN cuerpo
// cifrado. El push solo "despierta" al service worker, que pide al servidor
// sus notificaciones pendientes identificándose con su propio endpoint de push
// (secreto, solo lo conocen el dispositivo y el servidor). No depende de la
// cookie de sesión, que iOS no siempre envía desde el service worker.
// Cada dispositivo lleva su propio cursor: todos reciben todas.
// Las claves VAPID se generan solas la primera vez y se guardan cifradas.
import crypto from "node:crypto"
import type Database from "better-sqlite3"
import { getAutomationDatabase } from "../automation/db/database"
import { decryptCredentialDetailed, encryptCredential } from "../integrations/credentialVault"

const VAPID_SETTING = "vapid_keys"
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:notifications@autolisty.com"

type VapidKeys = { publicKey: string; privateJwk: crypto.JsonWebKey }

function b64url(buffer: Buffer) {
  return buffer.toString("base64url")
}

export function getVapidKeys(database: Database.Database = getAutomationDatabase()): VapidKeys {
  const row = database
    .prepare("SELECT setting_value FROM automation_settings WHERE setting_key = ?")
    .get(VAPID_SETTING) as { setting_value: string } | undefined
  if (row) {
    try {
      const { value, legacy } = decryptCredentialDetailed<VapidKeys>("vapid", row.setting_value)
      if (legacy) {
        database.prepare("UPDATE automation_settings SET setting_value = ?, updated_at = ? WHERE setting_key = ?")
          .run(encryptCredential("vapid", value), new Date().toISOString(), VAPID_SETTING)
      }
      return value
    } catch {
      // Clave del servidor cambiada: se generan nuevas y hay que volver a activar el móvil.
    }
  }
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" })
  const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string }
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")])
  const keys: VapidKeys = { publicKey: b64url(raw), privateJwk: privateKey.export({ format: "jwk" }) }
  database.prepare(`
    INSERT INTO automation_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at
  `).run(VAPID_SETTING, encryptCredential("vapid", keys), new Date().toISOString())
  // Si había claves (ilegibles), los dispositivos suscritos con ellas ya no sirven.
  if (row) database.prepare("DELETE FROM push_subscriptions").run()
  return keys
}

export function buildVapidAuthorization(endpoint: string, keys: VapidKeys, now = Date.now()) {
  const audience = new URL(endpoint).origin
  const header = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })))
  const claims = b64url(Buffer.from(JSON.stringify({
    aud: audience,
    exp: Math.floor(now / 1000) + 12 * 60 * 60,
    sub: VAPID_SUBJECT,
  })))
  const signature = crypto.sign("sha256", Buffer.from(`${header}.${claims}`), {
    key: crypto.createPrivateKey({ key: keys.privateJwk, format: "jwk" }),
    dsaEncoding: "ieee-p1363",
  })
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${keys.publicKey}`
}

export type PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } }

const ALLOWED_PUSH_HOSTS = [
  "web.push.apple.com",
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  ".notify.windows.com",
]

export function isAllowedPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint)
    if (url.protocol !== "https:") return false
    return ALLOWED_PUSH_HOSTS.some((host) => host.startsWith(".") ? url.hostname.endsWith(host) : url.hostname === host)
  } catch {
    return false
  }
}

export function saveSubscription(input: PushSubscriptionInput, userAgent: string | null, database = getAutomationDatabase()) {
  if (!isAllowedPushEndpoint(input.endpoint)) throw new Error("Unsupported push service.")
  database.prepare(`
    INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent, created_at, last_notification_id)
    VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(id), 0) FROM owner_notifications))
    ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent
  `).run(input.endpoint, input.keys.p256dh, input.keys.auth, userAgent?.slice(0, 300) || null, new Date().toISOString())
}

export function deleteSubscription(endpoint: string, database = getAutomationDatabase()) {
  database.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint)
}

export function countSubscriptions(database = getAutomationDatabase()) {
  return (database.prepare("SELECT COUNT(*) AS count FROM push_subscriptions").get() as { count: number }).count
}

/**
 * Notificaciones que este dispositivo aún no ha mostrado (null si el endpoint no
 * es un dispositivo activado). Avanza su cursor.
 */
export function takePendingNotificationsFor(endpoint: string, database = getAutomationDatabase()) {
  const take = database.transaction(() => {
    const subscription = database
      .prepare("SELECT last_notification_id FROM push_subscriptions WHERE endpoint = ?")
      .get(endpoint) as { last_notification_id: number } | undefined
    if (!subscription) return null
    const rows = database.prepare(`
      SELECT id, title, body, url, tag FROM owner_notifications
      WHERE id > ? AND created_at >= ?
      ORDER BY id ASC LIMIT 5
    `).all(subscription.last_notification_id, new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString()) as Array<{ id: number; title: string; body: string; url: string | null; tag: string | null }>
    if (rows.length) {
      const now = new Date().toISOString()
      database.prepare("UPDATE push_subscriptions SET last_notification_id = ? WHERE endpoint = ?").run(rows[rows.length - 1].id, endpoint)
      database.prepare(`UPDATE owner_notifications SET delivered_at = COALESCE(delivered_at, ?) WHERE id IN (${rows.map(() => "?").join(",")})`)
        .run(now, ...rows.map((row) => row.id))
    }
    return rows
  })
  return take()
}

async function wake(endpoint: string, keys: VapidKeys) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: buildVapidAuthorization(endpoint, keys),
      TTL: String(24 * 60 * 60),
      Urgency: "normal",
      "Content-Length": "0",
    },
    signal: AbortSignal.timeout(15_000),
  })
  return response.status
}

/**
 * Guarda una notificación y despierta a todos los dispositivos activados.
 * Nunca lanza: una notificación fallida no debe parar la producción.
 */
export async function notifyOwner(
  input: { title: string; body: string; url?: string | null; tag?: string | null },
  database: Database.Database = getAutomationDatabase()
) {
  try {
    database.prepare(`
      INSERT INTO owner_notifications (title, body, url, tag, created_at) VALUES (?, ?, ?, ?, ?)
    `).run(input.title.slice(0, 120), input.body.slice(0, 400), input.url || null, input.tag || null, new Date().toISOString())

    const subscriptions = database.prepare("SELECT endpoint FROM push_subscriptions").all() as Array<{ endpoint: string }>
    if (!subscriptions.length) return
    const keys = getVapidKeys(database)
    await Promise.all(subscriptions.map(async ({ endpoint }) => {
      try {
        const status = await wake(endpoint, keys)
        if (status === 404 || status === 410) deleteSubscription(endpoint, database)
        else if (status >= 200 && status < 300) {
          database.prepare("UPDATE push_subscriptions SET last_success_at = ? WHERE endpoint = ?").run(new Date().toISOString(), endpoint)
        } else console.error(`[push] ${new URL(endpoint).hostname} respondió ${status}`)
      } catch (error) {
        console.error("[push] envío fallido:", error)
      }
    }))
  } catch (error) {
    console.error("[push] notifyOwner failed:", error)
  }
}
