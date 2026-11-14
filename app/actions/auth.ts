"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { SESSION_COOKIE } from "@/lib/auth/session"
import { getOwnerSession } from "@/lib/auth/ownerSession"
import { revokeAllSessions } from "@/lib/auth/sessionRevocation"

export async function signOutOfAutolisty() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
  redirect("/login")
}

/** Cierra la sesión en todos los dispositivos (móvil perdido, sesión olvidada en otro PC…). */
export async function signOutEverywhere() {
  if (await getOwnerSession()) revokeAllSessions()
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
  redirect("/login")
}
