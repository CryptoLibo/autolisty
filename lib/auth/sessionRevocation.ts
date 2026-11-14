import type Database from "better-sqlite3"
import { getAutomationDatabase } from "../automation/db/database"

// Revocar sesiones (S3): una sesión solo vale si su passkey sigue registrado y se creó
// después del último «cerrar todas las sesiones».
const VALID_AFTER_KEY = "auth.sessions_valid_after"

export function isSessionActive(
  payload: { cid: string; iat: number },
  database: Database.Database = getAutomationDatabase()
) {
  const passkey = database.prepare("SELECT 1 FROM auth_passkeys WHERE id = ?").get(payload.cid)
  if (!passkey) return false
  const row = database.prepare("SELECT setting_value FROM automation_settings WHERE setting_key = ?").get(VALID_AFTER_KEY) as
    | { setting_value: string }
    | undefined
  if (!row) return true
  return payload.iat >= Number(row.setting_value)
}

/** Invalida todas las sesiones abiertas (en cualquier dispositivo) creadas hasta ahora. */
export function revokeAllSessions(database: Database.Database = getAutomationDatabase(), now = Date.now()) {
  // +1 s: la sesión que se cree justo después sigue siendo válida.
  database.prepare(`
    INSERT INTO automation_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at
  `).run(VALID_AFTER_KEY, String(Math.floor(now / 1000) + 1), new Date(now).toISOString())
}
