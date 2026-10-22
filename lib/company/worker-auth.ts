import crypto from "node:crypto"
import { getCompanyDatabase } from "./db"

export function authorizedCompanyWorker(request: Request) {
  const secret = process.env.AUTH_SECRET
  const supplied = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get("authorization") || "")?.[1]
  if (!secret || !supplied) return false
  const expected = crypto.createHmac("sha256", secret).update("company-kittl-worker-v1").digest("hex")
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
}

export function markCompanyWorkerAlive() {
  getCompanyDatabase().prepare("INSERT INTO company_worker_heartbeat(id,seen_at) VALUES('main',?) ON CONFLICT(id) DO UPDATE SET seen_at=excluded.seen_at")
    .run(new Date().toISOString())
}

export function requireCompanyWorkerAlive() {
  const row = getCompanyDatabase().prepare("SELECT seen_at FROM company_worker_heartbeat WHERE id='main'").get() as { seen_at: string } | undefined
  if (!row || Date.now() - Date.parse(row.seen_at) > 5 * 60_000) throw new Error("El trabajador de Company no está activo. Inícialo antes de gastar créditos Kittl.")
}

export function companyWorkerStatus() {
  const row = getCompanyDatabase().prepare("SELECT seen_at FROM company_worker_heartbeat WHERE id='main'").get() as { seen_at: string } | undefined
  return { active: !!row && Date.now() - Date.parse(row.seen_at) <= 5 * 60_000, lastSeen: row?.seen_at || null }
}
