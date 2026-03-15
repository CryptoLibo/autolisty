import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import {
  PINTEREST_AUTH_COOKIE,
  PINTEREST_PKCE_COOKIE,
} from "@/lib/pinterest/auth"

export const runtime = "nodejs"

export async function POST() {
  const cookieStore = await cookies()
  cookieStore.delete(PINTEREST_AUTH_COOKIE)
  cookieStore.delete(PINTEREST_PKCE_COOKIE)

  return NextResponse.json({ ok: true })
}
