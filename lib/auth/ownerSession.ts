import { cookies } from "next/headers"
import { SESSION_COOKIE, verifySessionToken } from "./session"
import { isSessionActive } from "./sessionRevocation"

// Sesión del propietario en rutas y páginas del servidor: firma válida, passkey aún
// registrado y creada después del último «cerrar todas las sesiones».
export async function getOwnerSession() {
  const cookieStore = await cookies()
  const payload = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value)
  if (!payload) return null
  try {
    return isSessionActive(payload) ? payload : null
  } catch {
    return null
  }
}
