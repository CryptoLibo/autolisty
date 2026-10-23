import crypto from "node:crypto"
import { getCompanyDatabase } from "./db"

export const VOICE_TURN_MAX_MS = 20_000
export const VOICE_TRANSCRIBE_RESERVE_USD = 0.003
export const VOICE_SPEAK_RESERVE_USD = 0.04
export const VOICE_DAILY_CAP_USD = 0.5

export function voiceEnabled() {
  return process.env.COMPANY_VOICE_ENABLED === "1" && Boolean(process.env.OPENAI_API_KEY)
}

export function voiceUsageToday() {
  const today = new Date().toISOString().slice(0, 10)
  const row = getCompanyDatabase().prepare(`SELECT COUNT(*) AS calls,
    COALESCE(SUM(reserved_usd),0) AS reservedUsd,
    COALESCE(SUM(estimated_usd),0) AS estimatedUsd
    FROM company_voice_usage WHERE created_at>=? AND created_at<? AND status!='CANCELLED'`)
    .get(`${today}T00:00:00.000Z`, `${today}T23:59:59.999Z`) as { calls: number; reservedUsd: number; estimatedUsd: number }
  return { dayUtc: today, ...row, capUsd: VOICE_DAILY_CAP_USD }
}

export function reserveVoice(kind: "transcribe" | "speak", reservedUsd: number) {
  if (!voiceEnabled()) throw new Error("La voz no está habilitada.")
  const db = getCompanyDatabase()
  return db.transaction(() => {
    const today = new Date().toISOString().slice(0, 10)
    const row = db.prepare("SELECT COALESCE(SUM(reserved_usd),0) AS total FROM company_voice_usage WHERE created_at>=? AND created_at<? AND status!='CANCELLED'")
      .get(`${today}T00:00:00.000Z`, `${today}T23:59:59.999Z`) as { total: number }
    if (row.total + reservedUsd > VOICE_DAILY_CAP_USD) throw new Error("Se alcanzó el límite diario de voz del piloto.")
    const id = crypto.randomUUID()
    db.prepare("INSERT INTO company_voice_usage(id,kind,status,reserved_usd,created_at) VALUES(?,?,?,?,?)")
      .run(id, kind, "RESERVED", reservedUsd, new Date().toISOString())
    return id
  })()
}

export function finishVoice(id: string, estimateUsd: number, durationSeconds?: number, characters?: number) {
  getCompanyDatabase().prepare("UPDATE company_voice_usage SET status='COMPLETED',estimated_usd=?,duration_seconds=?,characters=?,completed_at=? WHERE id=?")
    .run(estimateUsd, durationSeconds ?? null, characters ?? null, new Date().toISOString(), id)
}

export function failVoice(id: string) {
  // Provider failures may be charged; keep the reservation until reconciliation.
  getCompanyDatabase().prepare("UPDATE company_voice_usage SET status='UNCERTAIN',completed_at=? WHERE id=? AND status='RESERVED'")
    .run(new Date().toISOString(), id)
}

export function speakableText(content: string) {
  return content.replace(/https?:\/\/\S+/g, "enlace disponible en pantalla")
    .replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim().slice(0, 1200)
}

export function containsSensitiveCredential(content: string) {
  return /\b(api[_ -]?key|client[_ -]?secret|access[_ -]?token|refresh[_ -]?token|password|contraseñ[ao]|clave privada)\b\s*[:=]/i.test(content)
    || /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[opurs]_[A-Za-z0-9_]{20,})\b/.test(content)
}
