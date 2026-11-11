// Copia de seguridad diaria de la base de datos de Autolisty (jobs, passkeys,
// tokens cifrados, cola…): instantánea consistente de SQLite → gzip → cifrado
// AES-256-GCM con BACKUP_PASSPHRASE → R2 (backups/), conservando 14 días.
// Restaurar: node scripts/restore-backup.mjs <archivo.enc> <salida.sqlite>
import crypto from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import zlib from "node:zlib"
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3"
import type Database from "better-sqlite3"
import { r2 } from "../r2/client"

const LAST_BACKUP_KEY = "backup.last_at"
const BACKUP_EVERY_MS = 24 * 60 * 60_000
const KEEP_DAYS = 14
export const BACKUP_PREFIX = "backups/"
const MAGIC = Buffer.from("ALBK1")

/** Formato: "ALBK1" + salt(16) + iv(12) + tag(16) + datos cifrados (gzip de la base). */
export function encryptBackup(plain: Buffer, passphrase: string) {
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const key = crypto.scryptSync(passphrase, salt, 32)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(zlib.gzipSync(plain)), cipher.final()])
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), encrypted])
}

export function decryptBackup(file: Buffer, passphrase: string) {
  if (!file.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Not an Autolisty backup file.")
  let offset = MAGIC.length
  const salt = file.subarray(offset, (offset += 16))
  const iv = file.subarray(offset, (offset += 12))
  const tag = file.subarray(offset, (offset += 16))
  const key = crypto.scryptSync(passphrase, salt, 32)
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  return zlib.gunzipSync(Buffer.concat([decipher.update(file.subarray(offset)), decipher.final()]))
}

function getSetting(database: Database.Database, key: string) {
  const row = database.prepare("SELECT setting_value FROM automation_settings WHERE setting_key = ?").get(key) as
    | { setting_value: string }
    | undefined
  return row?.setting_value ?? null
}

function setSetting(database: Database.Database, key: string, value: string) {
  database.prepare(`
    INSERT INTO automation_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at
  `).run(key, value, new Date().toISOString())
}

let warnedMissingPassphrase = false

/** Hace la copia si han pasado 24 h desde la última. Devuelve la clave subida o null. */
export async function runDailyBackupIfDue(database: Database.Database, now = new Date()) {
  const passphrase = String(process.env.BACKUP_PASSPHRASE || "")
  if (passphrase.length < 32) {
    if (!warnedMissingPassphrase) console.warn("[backup] BACKUP_PASSPHRASE missing or shorter than 32 characters; backups disabled.")
    warnedMissingPassphrase = true
    return null
  }
  const last = getSetting(database, LAST_BACKUP_KEY)
  if (last && now.getTime() - Date.parse(last) < BACKUP_EVERY_MS) return null

  const tmp = path.join(os.tmpdir(), `autolisty-backup-${process.pid}-${Date.now()}.sqlite`)
  try {
    await database.backup(tmp)
    const encrypted = encryptBackup(await fs.readFile(tmp), passphrase)
    const key = `${BACKUP_PREFIX}automation-${now.toISOString().slice(0, 10)}.sqlite.gz.enc`
    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: encrypted,
      ContentType: "application/octet-stream",
    }))
    setSetting(database, LAST_BACKUP_KEY, now.toISOString())
    await pruneOldBackups(now)
    console.info(`[backup] ${key} (${encrypted.length} bytes)`)
    return key
  } finally {
    await fs.rm(tmp, { force: true })
  }
}

async function pruneOldBackups(now: Date) {
  const cutoff = new Date(now.getTime() - KEEP_DAYS * 24 * 60 * 60_000).toISOString().slice(0, 10)
  const listed = await r2.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET!, Prefix: BACKUP_PREFIX }))
  const old = (listed.Contents || [])
    .map((item) => item.Key || "")
    .filter((key) => {
      const date = key.match(/automation-(\d{4}-\d{2}-\d{2})/)?.[1]
      return date && date < cutoff
    })
  if (old.length) {
    await r2.send(new DeleteObjectsCommand({
      Bucket: process.env.R2_BUCKET!,
      Delete: { Objects: old.map((Key) => ({ Key })) },
    }))
  }
}
