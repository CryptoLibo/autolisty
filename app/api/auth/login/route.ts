import { NextResponse } from "next/server"
import {
  createSessionToken,
  getConfiguredPassword,
  getConfiguredUsername,
  getSessionCookieName,
  getSessionDurationSeconds,
} from "@/lib/auth/session"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json()

    if (
      username !== getConfiguredUsername() ||
      password !== getConfiguredPassword()
    ) {
      return new Response("Invalid credentials", { status: 401 })
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.set(getSessionCookieName(), await createSessionToken(username), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: getSessionDurationSeconds(),
    })

    return response
  } catch (error: any) {
    return new Response(error?.message || "Login failed", { status: 500 })
  }
}
