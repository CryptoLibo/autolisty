import { NextResponse } from "next/server"
import { getSessionCookieName } from "@/lib/auth/session"

export const runtime = "nodejs"

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(getSessionCookieName(), "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })

  return response
}
