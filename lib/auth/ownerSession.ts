import { cookies } from "next/headers"
import { SESSION_COOKIE, verifySessionToken } from "./session"

// Sesión del propietario en rutas y páginas del servidor.
export async function getOwnerSession() {
  const cookieStore = await cookies()
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value)
}
